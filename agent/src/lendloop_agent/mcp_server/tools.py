"""LendLoop's read-only tools, for the agent and any MCP client.

Every tool runs a public Convex query with the signed-in member's own token, so it
sees exactly what that member sees in the app, and nothing else. Every call is
written to the audit log. Tools that change anything come later, behind a
confirmation step.
"""

import time
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Any, Literal

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp_types import ToolAnnotations
from pydantic import AfterValidator, AliasGenerator, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from lendloop_agent.audit import AuditLog
from lendloop_agent.convex import ConvexClient, ConvexError

# Lists are capped: a model reads every item, and every item costs tokens.
MAX_DESCRIPTION = 300
MAX_SEARCH_RESULTS = 20
MAX_LIST = 50

READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)

LoanStatus = Literal["pending", "approved", "declined", "cancelled", "returned"]
Day = Annotated[str, Field(description="A calendar date, YYYY-MM-DD.")]


def _shorten(text: str) -> str:
    return text if len(text) <= MAX_DESCRIPTION else text[:MAX_DESCRIPTION] + "..."


Description = Annotated[str, AfterValidator(_shorten)]


@dataclass(frozen=True)
class ToolDeps:
    """What the tools need, opened once when the server starts."""

    convex: ConvexClient
    audit: AuditLog


class _FromConvex(BaseModel):
    """Read from Convex's camelCase fields; the model sees snake_case names.

    The JSON schema MCP publishes describes what the tool returns (snake_case), not
    what it reads from Convex: clients check results against it.
    """

    model_config = ConfigDict(
        alias_generator=AliasGenerator(validation_alias=to_camel),
        json_schema_mode_override="serialization",
    )


class Category(_FromConvex):
    id: str = Field(validation_alias="_id")
    label: str


class DateRange(_FromConvex):
    start_date: str
    end_date: str


class ToolListing(_FromConvex):
    id: str = Field(validation_alias="_id")
    name: str
    category: str = Field(validation_alias="categoryLabel")
    condition: str
    description: Description
    owner_name: str
    owner_is_trusted_lender: bool
    is_mine: bool
    availability: Literal["available", "onLoan"]
    available_from: str | None = None
    upcoming_bookings: list[DateRange]


class OwnListing(_FromConvex):
    id: str = Field(validation_alias="_id")
    name: str
    category: str = Field(validation_alias="categoryLabel")
    condition: str
    description: Description


class LoanRequest(_FromConvex):
    id: str = Field(validation_alias="_id")
    requested_at: datetime = Field(validation_alias="_creationTime")
    tool_name: str
    lender_name: str
    borrower_name: str
    start_date: str
    end_date: str
    status: LoanStatus
    decline_reason: str | None = None


class ActivityEntry(_FromConvex):
    at: datetime = Field(validation_alias="_creationTime")
    kind: str
    role: Literal["borrower", "lender"]
    other_name: str
    tool_name: str
    start_date: str
    end_date: str
    decline_reason: str | None = None


class Availability(_FromConvex):
    available: bool
    reason: str | None = None
    booked_ranges: list[DateRange]


# What the tools return. Wrapping each list in an object gives MCP clients a named
# field ("tools", "requests", ...) instead of a bare array.
class Categories(BaseModel):
    categories: list[Category]


class SearchResults(BaseModel):
    tools: list[ToolListing]
    has_more: bool = Field(description="More tools match; search with more specific words.")


class Listings(BaseModel):
    listings: list[OwnListing]


class Requests(BaseModel):
    requests: list[LoanRequest]


class Activity(BaseModel):
    entries: list[ActivityEntry]


async def _query(ctx: Context[ToolDeps, Any], tool: str, path: str, args: dict[str, Any]) -> Any:
    """Runs one Convex query as the signed-in member, and audits it, success or not.

    A failure becomes a ToolError with a message safe to show: the model reads it and
    can explain it to the member or try something else.
    """
    deps = ctx.request_context.lifespan_context
    token = get_access_token()
    if token is None or token.subject is None:  # Unreachable: the transport requires a token.
        raise ToolError("Sign in to use the assistant.")
    started = time.perf_counter()
    outcome = "error"
    try:
        value = await deps.convex.query(path, args, token.token)
        outcome = "ok"
        return value
    except ConvexError as error:
        outcome = error.kind
        raise ToolError(error.message) from error
    finally:
        await deps.audit.record(
            f"user:{token.subject}",
            "tool.call",
            {
                "tool": tool,
                "args": args,
                "outcome": outcome,
                "ms": round((time.perf_counter() - started) * 1000),
            },
        )


def register_read_tools(server: MCPServer[ToolDeps]) -> None:
    @server.tool(annotations=READ_ONLY)
    async def list_categories(ctx: Context[ToolDeps, Any]) -> Categories:
        """The categories tools are listed under, A to Z. Pass a category's id to
        search_tools to see only that category."""
        value = await _query(ctx, "list_categories", "categories:listActive", {})
        return Categories(categories=[Category.model_validate(item) for item in value])

    @server.tool(annotations=READ_ONLY)
    async def search_tools(
        ctx: Context[ToolDeps, Any],
        query: Annotated[
            str | None, Field(description="Words in the tool's name, e.g. 'drill'.")
        ] = None,
        category_id: Annotated[str | None, Field(description="From list_categories.")] = None,
        limit: Annotated[int, Field(ge=1, le=MAX_SEARCH_RESULTS)] = 10,
    ) -> SearchResults:
        """Tools members are lending, best match first (newest first without a query).
        Shows each tool's owner, condition, whether it is on loan now, and its next
        bookings. Leave both filters out to see the newest tools."""
        args = {
            "search": query,
            "categoryId": category_id,
            "paginationOpts": {"numItems": limit, "cursor": None},
        }
        value = await _query(ctx, "search_tools", "tools:browse", args)
        return SearchResults(
            tools=[ToolListing.model_validate(item) for item in value["page"]],
            has_more=not value["isDone"],
        )

    @server.tool(annotations=READ_ONLY)
    async def check_availability(
        ctx: Context[ToolDeps, Any],
        tool_id: Annotated[str, Field(description="From search_tools.")],
        start_date: Day,
        end_date: Day,
    ) -> Availability:
        """Whether the member could request this tool for these dates (both included),
        and if not, why. Lists the dates the tool is already booked, to suggest others.
        Changes nothing."""
        args = {"toolId": tool_id, "startDate": start_date, "endDate": end_date}
        value = await _query(ctx, "check_availability", "loans:checkAvailability", args)
        return Availability.model_validate(value)

    @server.tool(annotations=READ_ONLY)
    async def my_requests(
        ctx: Context[ToolDeps, Any],
        status: LoanStatus | None = None,
        limit: Annotated[int, Field(ge=1, le=MAX_LIST)] = 20,
    ) -> Requests:
        """Requests the member made to borrow other members' tools, newest first."""
        value = await _query(ctx, "my_requests", "loans:listMyRequests", {})
        return Requests(requests=_loans(value, status, limit))

    @server.tool(annotations=READ_ONLY)
    async def incoming_requests(
        ctx: Context[ToolDeps, Any],
        status: LoanStatus | None = None,
        limit: Annotated[int, Field(ge=1, le=MAX_LIST)] = 20,
    ) -> Requests:
        """Requests other members made to borrow the member's tools, newest first.
        status="pending" gives the ones waiting for the member's answer."""
        value = await _query(ctx, "incoming_requests", "loans:listIncoming", {})
        return Requests(requests=_loans(value, status, limit))

    @server.tool(annotations=READ_ONLY)
    async def my_listings(ctx: Context[ToolDeps, Any]) -> Listings:
        """The tools the member is lending, newest first."""
        value = await _query(ctx, "my_listings", "tools:listMine", {})
        return Listings(listings=[OwnListing.model_validate(item) for item in value[:MAX_LIST]])

    @server.tool(annotations=READ_ONLY)
    async def my_activity(
        ctx: Context[ToolDeps, Any],
        limit: Annotated[int, Field(ge=1, le=MAX_LIST)] = 10,
    ) -> Activity:
        """What happened recently to the member's requests and loans, as borrower or
        lender, newest first: requests, approvals, declines, cancellations, returns, and
        the emails and reminders LendLoop sent about them."""
        args = {"paginationOpts": {"numItems": limit, "cursor": None}}
        value = await _query(ctx, "my_activity", "activity:listMine", args)
        return Activity(entries=[ActivityEntry.model_validate(item) for item in value["page"]])


def _loans(value: list[Any], status: str | None, limit: int) -> list[LoanRequest]:
    loans = [LoanRequest.model_validate(item) for item in value]
    return [loan for loan in loans if status is None or loan.status == status][:limit]
