from dataclasses import dataclass

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from pydantic import BaseModel, Field

from lendloop_agent.models.usage import UsageRecorder

# A small task that only a model able to call tools can pass, shaped like the real
# LendLoop work: pick the right tool and fill its arguments from the question.
_QUESTION = "Is the extension ladder free to borrow on 2026-11-21? Use the tool to check."
_EXPECTED_DATE = "2026-11-21"


class CheckAvailability(BaseModel):
    """Check whether a tool listed on LendLoop is free to borrow on a date."""

    tool_name: str = Field(description="Name of the tool, e.g. 'drill'")
    date: str = Field(description="The date, as YYYY-MM-DD")


@dataclass
class CheckResult:
    passed: bool
    reason: str


def check_tool_calling(model: BaseChatModel, recorder: UsageRecorder) -> CheckResult:
    """Asks the model one question that needs a tool, and checks the call it makes.
    A model that cannot call tools cannot run the agent, so it must pass this first."""
    try:
        bound = model.bind_tools([CheckAvailability])
    except NotImplementedError:
        return CheckResult(False, "This model does not support tool calling.")
    try:
        reply = bound.invoke(_QUESTION, config={"callbacks": [recorder]})
    except Exception as error:  # noqa: BLE001 - each provider raises its own network/API errors
        return CheckResult(False, f"Could not reach the model ({type(error).__name__}: {error}).")
    calls = reply.tool_calls if isinstance(reply, AIMessage) else []
    if not calls:
        return CheckResult(False, "The model answered in text instead of calling the tool.")
    call = calls[0]
    if call["name"] != "CheckAvailability":
        return CheckResult(False, f"The model called an unknown tool: {call['name']}.")
    args = call["args"]
    if "ladder" not in str(args.get("tool_name", "")).lower():
        return CheckResult(False, f"Wrong tool_name argument: {args.get('tool_name')!r}.")
    if args.get("date") != _EXPECTED_DATE:
        return CheckResult(False, f"Wrong date argument: {args.get('date')!r}.")
    return CheckResult(True, "Called the right tool with the right arguments.")
