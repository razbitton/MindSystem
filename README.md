# Personal Context OS

Self-hosted personal information and task orchestration system for humans and AI agents. The MVP stores every capture as immutable raw source data, normalizes free-form text into structured entities, exposes a REST/OpenAPI API, and provides an MCP-compatible JSON-RPC server with scoped tools.

## Quick Start

```bash
pnpm install
docker compose up --build
```

Open:

- Web UI: http://localhost:3000/login
- API health: http://localhost:4000/health
- OpenAPI: http://localhost:4000/api/openapi.json
- MCP endpoint: http://localhost:4100/mcp
- Compose dependency ports: Postgres `15432`, Redis `16379`, MinIO API `19000`, MinIO console `19001`

Local Docker login:

- Email: `admin@me.com`
- Password: `admin123`

For host-only development, copy `.env.example` to `.env`, start Postgres/Redis/MinIO, then run:

```bash
pnpm db:migrate
pnpm --filter @personal-context-os/api dev
pnpm --filter @personal-context-os/worker dev
pnpm --filter @personal-context-os/mcp-server dev
pnpm --filter @personal-context-os/web dev
```

## Architecture

```text
apps/
  web/          Next.js operational UI
  api/          Fastify REST API, ingest pipeline, and hosted MCP endpoint
  worker/       BullMQ background jobs
  mcp-server/   MCP-compatible JSON-RPC route module and standalone dev server

packages/
  shared/       Zod schemas, scopes, OpenAPI builder
  db/           Drizzle schema, migrations, bootstrap
  ai/           normalizer interface and heuristic implementation
  config/       environment validation
```

The API is the canonical application boundary. Hosted deployments mount the MCP JSON-RPC endpoint at `/mcp` on the API service. The MCP route authenticates agent tokens, checks scopes, records MCP audit events, and calls REST endpoints for core operations. The standalone `mcp-server` app remains available for local development and backward-compatible deployments.

## English and Hebrew UI

The web app has a core bilingual UI layer in `apps/web/src/i18n.tsx`. The app shell persists the selected language in local storage, updates the document `lang` and `dir` attributes, formats dates with `en-US` or `he-IL`, and uses logical CSS so the same screens work in LTR English and RTL Hebrew. User-entered and user-generated content is rendered with automatic text direction to support mixed Hebrew and English notes, tasks, project names, and search queries.

## Data Model

The migration creates:

- workspace/auth: `workspaces`, `users`, `api_clients`, `agent_tokens`
- capture/entity core: `raw_items`, `entities`, `projects`, `tasks`, `notes`, `documents`, `reminders`
- graph/search/schema: `entity_edges`, `entity_tags`, `chunks`, `schema_definitions`, `project_schema_overrides`
- governance/observability: `review_queue`, `audit_events`, `agent_runs`, `retrieval_logs`

`raw_items` is written before normalization. `entities` stores the generic canonical record, while typed tables hold project/task/note/document/reminder fields. `chunks` includes `fts` and pgvector-ready `embedding vector(1536)`.

## API Examples

Login and store the browser session cookie:

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@me.com","password":"admin123"}'
```

Capture free-form text:

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/ingest/free-text \
  -H "content-type: application/json" \
  -d '{"text":"Project: Launch Plan\nTask: write rollout checklist tomorrow\nNote: keep beta small","sourceType":"manual"}'
```

Search:

```bash
curl -b cookies.txt "http://localhost:4000/api/search?q=launch&entity_type=task&limit=10"
```

Create an agent token with a logged-in browser session cookie. Agent bearer tokens cannot call these token-configuration routes:

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/agents/tokens \
  -H "content-type: application/json" \
  -d '{"name":"Codex read-write","scopes":["memory:read","memory:write","projects:read","tasks:read","tasks:write"]}'
```

The plaintext token is returned once.

## MCP Examples

The MCP server aims for REST parity for scoped agent operations. It exposes explicit tools for project, task, note, document, reminder, raw capture, review queue, audit, retrieval-log, and schema routes, while browser-session-only auth and agent-token routes stay REST/browser-only. Destructive tools such as `delete_task`, `delete_project`, `delete_note`, `delete_document`, `delete_reminder`, and `delete_raw_item` are available, but they are explicit tools and require the matching write or admin scope. Grant agent tokens the least scopes needed for the job.

Admin tokens can also inspect `data-inventory://workspace` and call `purge_workspace_data` to delete selected workspace-owned categories: `raw_items`, `entities`, `review_queue`, `audit_events`, `agent_runs`, `retrieval_logs`, `schema_definitions`, and `project_schema_overrides`. Agent-token configuration is deliberately excluded from MCP and agent bearer API access; it is managed only by an authenticated browser user.

List tools:

```bash
curl -X POST http://localhost:4100/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Call `search_memory`:

```bash
curl -X POST http://localhost:4100/mcp \
  -H "content-type: application/json" \
  -H "authorization: Bearer pcos_your_token" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_memory","arguments":{"q":"launch","limit":5}}}'
```

Read a project context pack:

```bash
curl -X POST http://localhost:4100/mcp \
  -H "content-type: application/json" \
  -H "authorization: Bearer pcos_your_token" \
  -d '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"context-pack://project/PROJECT_ID"}}'
```

Update a project:

```bash
curl -X POST http://localhost:4100/mcp \
  -H "content-type: application/json" \
  -H "authorization: Bearer pcos_your_token" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"update_project","arguments":{"id":"PROJECT_ID","status":"paused","priority":"high"}}}'
```

Delete a task:

```bash
curl -X POST http://localhost:4100/mcp \
  -H "content-type: application/json" \
  -H "authorization: Bearer pcos_your_token" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"delete_task","arguments":{"id":"TASK_ID"}}}'
```

Create a note:

```bash
curl -X POST http://localhost:4100/mcp \
  -H "content-type: application/json" \
  -H "authorization: Bearer pcos_your_token" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"create_note","arguments":{"title":"Decision","body":"Use scoped MCP tools for agent writes.","projectId":"PROJECT_ID"}}}'
```

Approve a review item:

```bash
curl -X POST http://localhost:4100/mcp \
  -H "content-type: application/json" \
  -H "authorization: Bearer pcos_your_admin_token" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"approve_review_item","arguments":{"id":"REVIEW_ITEM_ID"}}}'
```

Example Codex/OpenClaw MCP config:

```json
{
  "mcpServers": {
    "personal-context-os": {
      "url": "http://localhost:4100/mcp",
      "headers": {
        "Authorization": "Bearer pcos_your_token"
      }
    }
  }
}
```

## Render and Domain Notes

This repository includes `render.yaml` for Render Blueprints. It defines:

- `mindsystem-web`: public Next.js web service
- `mindsystem-api`: public Fastify API service and MCP endpoint at `/mcp`
- `mindsystem-worker`: background worker
- `mindsystem-postgres`: Render Postgres
- `mindsystem-redis`: Render Key Value
- `mindsystem-runtime`: shared generated/secrets environment group

To deploy:

1. Push the repo to GitHub.
2. In Render, choose New > Blueprint.
3. Connect `razbitton/MindSystem`.
4. Fill the prompted values:
   - `BOOTSTRAP_USER_EMAIL`
   - `BOOTSTRAP_USER_PASSWORD`
   - `S3_ENDPOINT`
   - `S3_ACCESS_KEY`
   - `S3_SECRET_KEY`
5. Deploy the Blueprint.
6. Open `https://razbitton.com/login` and sign in with the bootstrap credentials.

The worker uses Render's `starter` plan because Render does not support the `free` instance type for background workers. The web/API services and datastores are configured with free plans where Render supports them.

The production web domain is `https://razbitton.com`. The Blueprint disables the web service's default `onrender.com` subdomain after the custom domain is attached and verified.

When using a custom domain, keep these Render environment variables aligned:

- On `mindsystem-api`: set `APP_BASE_URL` to `https://razbitton.com`.
- On `mindsystem-worker`: set `APP_BASE_URL` to the same value for consistency.
- On `mindsystem-web`: keep `API_BASE_URL` pointed at `https://mindsystem-api.onrender.com` unless you also add a custom API domain.
- Set `MCP_SERVER_URL` to `https://mindsystem-api.onrender.com/mcp` for hosted agents.

The web app proxies browser calls from `/api/*` to `API_BASE_URL`, so login cookies remain same-origin on the web domain. Do not set `NEXT_PUBLIC_API_BASE_URL` on Render unless you intentionally want browsers to call the API service directly.

For Render or another hosted environment, run Postgres, Redis, the API, worker, and web app as separate services or containers. The API hosts `/mcp`; run the standalone MCP server only if you intentionally want a separate MCP process. Set these values per environment:

- `DATABASE_URL`, `REDIS_URL`, S3/MinIO-compatible storage variables
- `JWT_SECRET` with a long random value
- `BOOTSTRAP_USER_EMAIL` and `BOOTSTRAP_USER_PASSWORD` for the first login
- `APP_BASE_URL` to your web domain, for example `https://app.example.com`
- `API_BASE_URL` to the API service URL
- `MCP_SERVER_URL` to the public MCP URL if agents connect over the internet, for example `https://mindsystem-api.onrender.com/mcp`
- `SESSION_COOKIE_DOMAIN` only when sharing the session across subdomains, for example `.example.com`

Use HTTPS for hosted login cookies. Agents should receive scoped MCP/REST tokens, never database credentials.

## Normalization

`packages/ai` defines a `FreeTextNormalizer` interface and a deterministic `HeuristicNormalizer`. The API validates normalizer output with Zod before applying it. Items below `0.75` confidence are routed to `review_queue`; risky updates are not auto-applied in the MVP.

Pipeline order:

1. Save `raw_items`
2. Normalize free text
3. Validate normalized output
4. Resolve existing entities
5. Create canonical and typed entities
6. Create graph edges
7. Create chunks
8. Enqueue embedding and dashboard jobs
9. Create review items for low confidence

## Security Model

- Browser access uses email/password login, scrypt password hashes in `users.password_hash`, and signed HTTP-only session cookies.
- Set `BOOTSTRAP_USER_EMAIL`, `BOOTSTRAP_USER_PASSWORD`, and a strong `JWT_SECRET` before deploying.
- For a custom domain or split web/API hosts, set `APP_BASE_URL` and optionally `SESSION_COOKIE_DOMAIN`.
- Agent access is only through REST or MCP tools.
- Agent tokens are stored as SHA-256 hashes.
- Agent-token configuration is browser-session-only. Agents cannot list, create, revoke, delete, or bulk-purge agent tokens through REST bearer auth or MCP.
- MCP tools mirror concrete REST routes where feasible and require matching scopes such as `memory:read`, `memory:write`, `projects:write`, `tasks:write`, or `documents:write`.
- `admin` grants all scopes.
- Destructive MCP actions are explicit and scoped; there is no generic arbitrary REST-path MCP tool. Generic entity deletion and bulk purge are admin-only because they can cascade across typed records.
- Every ingest, entity creation/update, task completion, token creation, and MCP tool call writes `audit_events`.
- Rate limiting and CORS are configured in the API; production deployments should replace default secrets and restrict origins.
- Database credentials are never exposed to agents or the web client.

## Verification

```bash
pnpm typecheck
pnpm test
```

Current unit coverage includes normalizer schema validation, ingest confidence planning, entity resolution helpers, task validation, search SQL construction, and MCP scope checks.
