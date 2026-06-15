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

- Email: `local@personal-context-os.test`
- Password: `local-dev-password`

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
  api/          Fastify REST API and ingest pipeline
  worker/       BullMQ background jobs
  mcp-server/   MCP-compatible JSON-RPC server

packages/
  shared/       Zod schemas, scopes, OpenAPI builder
  db/           Drizzle schema, migrations, bootstrap
  ai/           normalizer interface and heuristic implementation
  config/       environment validation
```

The API is the canonical application boundary. The MCP server authenticates agent tokens, checks scopes, records MCP audit events, and calls REST endpoints for core operations.

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
  -d '{"email":"local@personal-context-os.test","password":"local-dev-password"}'
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

Create an agent token:

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/agents/tokens \
  -H "content-type: application/json" \
  -d '{"name":"Codex read-write","scopes":["memory:read","memory:write","projects:read","tasks:read","tasks:write"]}'
```

The plaintext token is returned once.

## MCP Examples

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

For Render or another hosted environment, run Postgres, Redis, the API, worker, MCP server, and web app as separate services or containers. Set these values per environment:

- `DATABASE_URL`, `REDIS_URL`, S3/MinIO-compatible storage variables
- `JWT_SECRET` with a long random value
- `BOOTSTRAP_USER_EMAIL` and `BOOTSTRAP_USER_PASSWORD` for the first login
- `APP_BASE_URL` to your web domain, for example `https://app.example.com`
- `API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` to the public API URL
- `MCP_SERVER_URL` to the public MCP URL if agents connect over the internet
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
- MCP write tools require least-privilege scopes such as `memory:write`, `tasks:write`, or `documents:write`.
- `admin` grants all scopes.
- Destructive MCP actions are intentionally not implemented.
- Every ingest, entity creation/update, task completion, token creation, and MCP tool call writes `audit_events`.
- Rate limiting and CORS are configured in the API; production deployments should replace default secrets and restrict origins.
- Database credentials are never exposed to agents or the web client.

## Verification

```bash
pnpm typecheck
pnpm test
```

Current unit coverage includes normalizer schema validation, ingest confidence planning, entity resolution helpers, task validation, search SQL construction, and MCP scope checks.
