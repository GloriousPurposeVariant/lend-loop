# LendLoop

**Borrow what you need. Lend what you don't.**

LendLoop is a neighbourhood tool-lending board. Members list tools they are happy to lend,
neighbours ask to borrow them for a date range, and the lender approves, declines and
marks them returned. n8n sends the emails and the overdue reminders.

Built with Next.js (App Router, TypeScript), Clerk, Convex (self-hosted in Docker) and
self-hosted n8n. Everything, including email, runs locally: nothing leaves your machine.

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Everyday commands](#everyday-commands)
- [Testing](#testing)
- [Security](#security)
- [The n8n integration](#the-n8n-integration)
- [Decisions and trade-offs](#decisions-and-trade-offs)
- [What I'd change for production](#what-id-change-for-production)
- [Dependency audit](#dependency-audit)
- [Room for an AI assistant](#room-for-an-ai-assistant)
- [How I used AI](#how-i-used-ai)

## What it does

**Anyone, signed out:** the home page lists tools by **name and category only**. The
Convex query's return validator enforces that shape, so no other field can leak.

**Members (signed in with Clerk):**

- **Browse** all tools, filtered by category and searched by name, with availability:
  _Available_, or _On loan · back 7 Nov 2026_, plus upcoming booked dates (never who
  booked them). Up to 6 photos per tool.
- **My listings:** list a tool (name, category, condition, description, photos), manage
  its photos, remove it.
- **Request to borrow** for a date range. The server enforces every rule: the start is on
  or before the end, not in the past, at most 30 days long and at most 180 days ahead, no
  overlap with an approved loan, not your own tool, one pending request per tool.
- **Incoming:** approve, decline, mark returned. Approving re-checks for overlaps and
  automatically declines the other pending requests it now overlaps.
- **My requests:** track and cancel requests.
- **Activity:** a live feed of everything that happened with your loans, from your side
  ("Priya approved your request…"), including the emails n8n sent you.

**Admins:**

- Remove any listing, see every loan, mark members as **Trusted Lender** (a badge on their
  tools), manage categories.
- **Automations:** deliveries to n8n that failed, are retrying or were skipped (with a
  Retry button), and failed n8n runs with a link to the run.

**Automations (n8n):** an email to the right person for every loan change, a daily
overdue reminder, and an error workflow that reports any failed run back to the app.

## Architecture

```
 Browser ──── Next.js (apps/web) ───── Clerk (sign-in, JWT)
    │  live queries over WebSocket
    ▼
 Convex backend (services/core, Docker) ── file storage (photos)
    │  ▲
    │  │ signed HTTP, HMAC-SHA256, both directions
    ▼  │
 n8n (Docker) ── SMTP ──▶ Mailpit (Docker, local inbox)
```

| Part           | Where                      | Role                                                                    |
| -------------- | -------------------------- | ----------------------------------------------------------------------- |
| Web app        | `apps/web`                 | Next.js App Router UI. No business rules: it calls Convex functions.    |
| Backend        | `services/core/convex`     | Schema, queries, mutations, HTTP endpoints, crons. All rules live here. |
| Shared helpers | `services/core/convex/lib` | Auth checks, dates, signing, loan rules. Not exposed as API functions.  |
| Workflows      | `n8n/workflows`            | n8n workflow JSON, imported with `npm run n8n:import`.                  |
| Infrastructure | `docker-compose.yml`       | Convex backend and dashboard, n8n, Mailpit, all pinned by image digest. |

It is an npm workspaces monorepo: `@lendloop/web` imports the generated Convex API types
from `@lendloop/core`, so a backend change that breaks the frontend fails the typecheck.

**Data model** (`services/core/convex/schema.ts`): `users`, `categories`, `tools`
(soft-deleted), `toolImages`, `loans` (pending → approved → returned, or declined /
cancelled), `outboundEvents` (the outbox for n8n), `inboundEvents` (idempotency keys from
n8n), `activity` (one row per person per feed entry) and `workflowFailures`.

## Getting started

### Prerequisites

- Node.js 24 (see `.nvmrc`) and npm
- Docker Desktop
- A free Clerk account (development instance)

### 1. Install

```sh
git clone https://github.com/GloriousPurposeVariant/lend-loop.git
cd lend-loop
npm ci
```

`npm ci` also installs the pre-commit hook that formats staged files.

### 2. Configure Clerk

In the Clerk dashboard:

1. **Configure → JWT templates → New template → Convex.** Keep the name `convex`, and set
   the claims to:
   ```json
   { "aud": "convex", "name": "{{user.full_name}}", "email": "{{user.primary_email_address}}" }
   ```
2. **Configure → API keys:** copy the publishable key, the secret key and the **Frontend
   API URL** (for example `https://your-instance.clerk.accounts.dev`).

### 3. Create the env files

`.env.example` lists every variable, grouped by the file it belongs in:

| File                       | What goes in it                                                      |
| -------------------------- | -------------------------------------------------------------------- |
| `.env`                     | Convex instance name and secret, n8n encryption key, two n8n secrets |
| `services/core/.env.local` | Convex URL and admin key (the admin key comes in step 4)             |
| `apps/web/.env.local`      | Convex URL and the two Clerk keys                                    |

Generate each secret with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Start the stack

```sh
npm run infra:up          # Convex, its dashboard, n8n, Mailpit
npm run convex:admin-key  # copy the key into services/core/.env.local
```

### 5. Configure the Convex deployment

These are read by Convex functions running in the container, so they are set on the
deployment, not in a file. From `services/core`:

```sh
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-instance.clerk.accounts.dev
npx convex env set LENDLOOP_ALLOW_SEED true   # development only
npx convex env set N8N_WEBHOOK_URL http://n8n:5678/webhook/lendloop-events
npx convex env set N8N_OUTBOUND_SECRET <same value as in /.env>
npx convex env set N8N_INBOUND_SECRET <same value as in /.env>
```

### 6. Deploy the backend, load data and workflows

From the repository root:

```sh
npm run dev:core          # keeps running: deploys Convex functions on every save
npm run categories:seed   # default categories (second terminal)
npm run n8n:import        # imports and publishes the three n8n workflows
npm run dev:web           # http://localhost:3000
```

### 7. Make yourself an admin

Sign in once in the app, so your user exists, then from `services/core`:

```sh
npx convex run users:promoteToAdmin '{"email":"you@example.com"}'
```

In Windows PowerShell 5.1, which strips the quotes from that JSON, use:

```powershell
$json = '{"email":"you@example.com"}' -replace '"', '\"'
npx convex run users:promoteToAdmin $json
```

### 8. Optional: sample data

```sh
npm run seed        # 4 sample members, 10 tools, loans in every state
npm run seed:clear  # removes only the sample data
```

Seed users have `.test` email addresses and can never sign in. Both commands refuse to run
unless `LENDLOOP_ALLOW_SEED=true` is set on the deployment.

### Local addresses

| What                | Address                 |
| ------------------- | ----------------------- |
| App                 | <http://localhost:3000> |
| Convex dashboard    | <http://127.0.0.1:6791> |
| n8n                 | <http://localhost:5678> |
| Mailpit (inbox)     | <http://localhost:8025> |
| Convex HTTP actions | <http://127.0.0.1:3211> |

## Everyday commands

| Command                                           | What it does                                             |
| ------------------------------------------------- | -------------------------------------------------------- |
| `npm run infra:up` / `infra:down`                 | Start or stop the Docker stack (data is kept in volumes) |
| `npm run dev:core`                                | Deploy Convex functions on every save                    |
| `npm run dev:web`                                 | Next.js dev server                                       |
| `npm run n8n:import`                              | Re-import and publish the n8n workflows from the repo    |
| `npm run n8n:reminders`                           | Run the overdue-reminder workflow now                    |
| `npm run n8n:request -- overdue`                  | Send a signed request to Convex as n8n would (debugging) |
| `npm test`                                        | Backend tests                                            |
| `npm run lint` / `typecheck` / `build` / `format` | The other checks CI runs                                 |

## Testing

```sh
npm test
```

**96 tests in 13 files**, run with Vitest and `convex-test`, an in-memory Convex
backend. They call the real queries, mutations and HTTP endpoints as real callers:
signed-out, members, the owner, admins, and n8n with valid and invalid signatures.

| Area              | Examples of what is proven                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Access control    | Signed-out callers are refused; members cannot act on others' tools or loans; admin-only functions refuse members                |
| Data minimisation | The public list returns name and category only; browse never reveals who booked a tool; feeds are private                        |
| Loan rules        | Every date rule; overlaps on approval; automatic declines with a reason; removing a tool declines its pending requests           |
| Photos            | Owner only; type, size and count limits; a file cannot be attached twice; unattached uploads are cleaned up                      |
| Signing           | The signature matches one computed independently with Node's `crypto`; tampering, wrong secrets and stale timestamps are refused |
| Delivery to n8n   | Signed delivery; retries at 30 s, 1, 2, 4 and 8 minutes; giving up after 6 attempts; admin retry                                 |
| Endpoints for n8n | Idempotency (a repeated id is answered `duplicate`); malformed events get 400; unsafe links are dropped                          |

Time-dependent tests freeze the clock, and the n8n network calls are replaced with a fake
`fetch`, so the suite is fast and deterministic.

**CI** (GitHub Actions, every push): format check, lint, typecheck, tests and a production
build. A pre-commit hook formats staged files with Prettier.

**Checked by hand against the real stack:** each n8n scenario was run end to end on Docker:
signature checks, duplicates, the mail server being down then back, the error workflow,
reminders and the admin retry. The web app has no automated UI tests yet (see
[production](#what-id-change-for-production)).

## Security

- **Identity comes from the verified Clerk JWT, never from arguments.** Every public
  function starts with `requireUser`, `requireAdmin` or an owner check
  (`convex/lib/auth.ts`). For example, `tools.create` takes no `ownerId`: the owner is
  always the caller.
- **Every function declares what it returns.** Convex rejects any extra field, so the
  public list physically cannot return more than name and category, and no query returns
  `tokenIdentifier`. Emails are only shown to admins, on the Members page.
- **Business rules run in Convex mutations**, which are serializable transactions: two
  approvals for overlapping dates cannot both pass the overlap check. The UI's checks are
  only for convenience.
- **Uploads** go straight to Convex storage through short-lived URLs. The server checks
  the stored file's real type and size, the owner and the per-tool limit before attaching
  it, and a cron deletes anything never attached.
- **n8n traffic is signed in both directions** (see below), with a 5-minute replay window,
  constant-time comparison and a separate secret per direction.
- **Secrets** live in git-ignored env files and in the Convex deployment environment.
  Nothing secret is committed; the workflow files read their secrets from environment
  variables.
- **Development-only tools are fenced off:** the seed refuses to run without
  `LENDLOOP_ALLOW_SEED=true`, and seed users can never sign in.
- **Untrusted input is checked at the edge:** loan ids from n8n go through `normalizeId`,
  report fields are type-checked and length-capped, and links are accepted only if they
  are `http(s)`.

## The n8n integration

```
loan mutation ──▶ outboundEvents row + scheduled delivery   (same transaction)
                    │ signed POST, retried with backoff
                    ▼
        n8n "loan event emails": verify → skip repeats → email → remember → report back
                    │ signed POST /n8n/events {email.sent}
                    ▼
        Convex: activity feed entry (idempotent)

n8n "overdue reminders" (daily 09:00 UTC) ── signed POST /n8n/overdue-loans ──▶ Convex
        └ for each loan: email the borrower ── signed POST /n8n/events {reminder.sent}

any failed run ──▶ n8n "error reporter" ── signed POST /n8n/events {workflow.failed}
```

**Signing.** The sender computes `HMAC-SHA256(secret, "<timestamp>.<raw body>")` and sends
it with the timestamp:

```
X-LendLoop-Timestamp: 1793620800
X-LendLoop-Signature: sha256=<64 hex characters>
```

The receiver recomputes the signature over the **raw bytes** (parsing and re-encoding
JSON could change them), compares in constant time, and refuses timestamps more than 5
minutes away. Convex signs events with `N8N_OUTBOUND_SECRET`; n8n signs its requests with
`N8N_INBOUND_SECRET`. Implementations: `convex/lib/signing.ts` and the "Verify signature"
Code node in n8n.

**Reliability.**

- **Outbox:** an event is written in the same transaction as the change, so it is never
  lost and never sent for a change that failed.
- **Retries:** Convex retries at 30 s, 1, 2, 4 and 8 minutes, then marks the event
  `failed`. Admins can retry it from Admin → Automations.
- **Idempotency both ways:** every event keeps its id across retries. n8n skips ids it
  has already emailed, and Convex records each id from n8n once. Reminder ids are one per
  loan per day, so a re-run never reminds twice.
- **Failure is visible:** if sending an email fails, n8n answers 500 and Convex retries.
  The Error Workflow reports every failed run to Convex, and the admin page shows it with
  a link to the run.
- **No configuration, no noise:** with `N8N_WEBHOOK_URL` unset, events are recorded as
  `skipped` instead of retrying forever.

## Decisions and trade-offs

- **One Convex function per use case, not a generic REST endpoint.** `tools.listPublic`,
  `tools.browse` and `tools.listMine` each have their own return validator, so each
  audience gets exactly the fields it should, enforced by the backend.
- **Self-hosted Convex in Docker** keeps everything local and reproducible. The CLI only
  pushes code; the container holds the data.
- **Dates are `YYYY-MM-DD` strings,** inclusive, in UTC. They sort as strings and have no
  time-zone surprises; "not in the past" allows one day of grace for users west of UTC.
- **Soft deletes for tools; categories are deactivated, never deleted,** so past loans
  always point at real rows.
- **Categories are data managed by admins,** not a hard-coded list.
- **The activity feed is its own table** (one row per person), not a query over loans: a
  feed is one index read, private by construction, and reads as it happened even after
  renames.
- **Workflow JSON lives in the repo** and is imported by script, so a fresh clone gets the
  same automations without clicking around in n8n.
- **The email report back to Convex is best effort.** If it fails, the run still succeeds,
  because failing it would make Convex retry and send the email twice. At worst one
  "We emailed you" line is missing from the feed.
- **Light theme only** for now, which is consistent and readable, rather than a half-done
  dark mode.

## What I'd change for production

**Infrastructure**

- Convex Cloud, or a self-hosted backend on Postgres with backups; n8n in queue mode on
  Postgres; HTTPS everywhere; a Clerk production instance.
- A real email provider (Postmark, SES) with SPF and DKIM, HTML templates and an
  unsubscribe or notification-preferences page.
- Alerting outside the stack (Slack or email to the team). If Convex itself is down, the
  Error Workflow cannot report there either.

**Secrets and n8n**

- Move the n8n secrets into n8n credentials or an external secrets store, and turn
  `N8N_BLOCK_ENV_ACCESS_IN_NODE` back on: today any workflow can read n8n's environment.
- Support two active secrets per direction (with a key id header), so they can be rotated
  without downtime.
- Keep n8n's handled event ids in a database table with an expiry, instead of the
  workflow's static data (the last 1,000 ids, reset on re-import).
- Delivery is at least once: a retry that arrives while the first attempt is still
  sending could produce a second email. A per-event lock in that table would close it.

**Data**

- Schema changes as widen → migrate → narrow migrations, rather than clearing tables as I
  did during development.
- A daily clean-up of `inboundEvents` (ids only need keeping longer than the 5-minute
  replay window) and a retention policy for old events, feed entries and photos of
  removed tools.
- Photo URLs are unguessable but not private. Serve photos through an HTTP action that
  checks the viewer is signed in, or use short-lived URLs.
- Rate limits on requests, uploads and upload URLs.
- Paginate the lists that are capped today (My listings, My requests, Incoming: 100 each).

**Product and quality**

- Playwright end-to-end tests for the main journeys, and an accessibility audit.
- Per-user time zones for dates and the reminder time.
- Search descriptions as well as names; dark mode.

## Dependency audit

`npm audit --omit=dev` reports **0 vulnerabilities** in production dependencies.

The full `npm audit` reports 16 moderate findings, all from one advisory
([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), a denial of
service in `minimatch` through crafted glob patterns), reached only through the ESLint
toolchain, which runs on the developer's own files. `npm audit fix --force` would
downgrade ESLint packages, so I left it until the ESLint plugins release fixed versions.

## Room for an AI assistant

A planned next step is a Python (LangChain) assistant that answers members' questions
about their loans. It fits as a separate service:

- its own database for conversations, so chat data never mixes with lending data;
- an MCP server exposing a few read-only, per-user tools (my loans, my requests, tool
  availability), backed by Convex HTTP endpoints signed the same way as the n8n ones, with
  the member's identity forwarded and checked;
- no direct database access, so every rule above still applies.

## How I used AI

[![Built with Claude](https://img.shields.io/badge/Built%20with-Claude-D97757?logo=claude&logoColor=white)](https://claude.ai)

I built LendLoop with Claude (Claude Code, in VS Code) as a pair programmer, and I want to be
clear about how.

**I set the speed limit.** Claude can write code far faster than anyone can read it. A
supercar can do hundreds of km/h, but you only drive it safely within a speed limit. My limit
was my own understanding: Claude wrote code only as fast as I could review it, not as fast as
it could build it, because I have to be able to explain every line of this repo.

**How each milestone worked:**

1. **We planned the milestones together.** Claude proposed a plan for each one; I corrected
   it, shaped it to how I wanted the app to work, and added features beyond the brief:
   admin-managed categories, tool photos, search, sample data, a pre-commit hook.
2. **We built each milestone together.** Once we agreed the design, we built it and checked
   it with format, lint, typecheck, tests and build. For the n8n work we also ran every
   scenario on a real Docker stack (Convex, n8n, Mailpit): signatures, duplicates, the mail
   server going down, retries and the error workflow.
3. **I reviewed it file by file:** the path, what each file does, why it is built that way,
   and an example. Where something did not match what I wanted, I asked for changes before it
   went in.
4. **I put every change into the repo myself,** ran it, checked it in the browser, committed
   it, and opened and merged each pull request. Claude never committed or pushed anything.

**It also caught my mistakes, and I fixed them:** formatting that failed CI, a pre-commit hook
still running its default command, a YAML indentation slip, a file I had missed, and a lost
`export default` that silently switched off the HTTP endpoints. Each time it explained the
cause before the fix, which taught me more than the fix itself.

**What is mine:** the decisions, several of which I questioned before accepting, such as why
some settings live on the Convex deployment instead of in a file, why there are separate
functions instead of one REST-style endpoint, and why categories should be data rather than a
hard-coded list. The understanding of the code is mine too, and so is the verification: 96
automated tests, CI on every push, and the manual checks at the end of each milestone. Commits
and pull requests carry no AI attribution because this section covers it, once.
