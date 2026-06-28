# Repository Operating Standard

This is the canonical instruction file for every coding agent in this repository. Read it at the start of every task. Also read any more-specific `AGENTS.md` in the subtree being changed.

## Start every task

1. Locate the root containing `package.json`, `pnpm-workspace.yaml`, and `.git`.
2. Read this file and the documentation relevant to the requested area.
3. Run `git status --short --branch`. Identify the branch and all pre-existing changes before editing.
4. Inspect the relevant source, tests, configuration, and actual execution path. Reproduce or understand the behavior before changing it.
5. For non-trivial work, state a short implementation and validation plan.

Never discard, overwrite, stage, commit, or reformat unrelated user changes. Keep changes limited to the smallest complete fix; do not mix in dependency upgrades, broad cleanup, renaming, or architectural work unless required by the task.

## Repository facts

- This is a private pnpm workspace monorepo written in strict TypeScript using ESM.
- `package.json` pins pnpm `10.33.0`. The documented install command is `pnpm install`.
- The container/deployment runtime is Node.js 22 Alpine. No local Node engine is declared; use Node 22 when runtime parity matters.
- Applications:
  - `apps/web`: Next.js 15 / React 19 UI. Server-side `/api/*` requests proxy to `API_BASE_URL`.
  - `apps/api`: Fastify 5 REST/OpenAPI API and the canonical application boundary.
  - `apps/worker`: BullMQ workers for Redis-backed background jobs.
  - `apps/mcp-server`: Fastify MCP-compatible JSON-RPC service. It authenticates scoped agent tokens and uses the API for core operations.
- Packages:
  - `packages/shared`: Zod schemas, scopes, and OpenAPI construction.
  - `packages/db`: Drizzle/Postgres schema, SQL migrations, and workspace bootstrap.
  - `packages/ai`: normalization interfaces and deterministic heuristic implementation.
  - `packages/config`: environment validation and Redis URL construction.
- Required services are PostgreSQL with pgvector, Redis, and S3-compatible storage (MinIO locally).
- Environment variables are validated in `packages/config/src/index.ts`; `DATABASE_URL` is required. Backend code reads `process.env` and the repository has no explicit dotenv loader. Do not assume that merely copying `.env.example` injects values into API, worker, MCP, or migration processes; ensure the launching shell or service actually exports them. Never commit `.env` files or credentials.

## Installation, startup, and ports

The canonical clean full-stack development path from `README.md` is:

```bash
pnpm install
docker compose up --build
```

Compose builds the workspace and starts dependencies, migrates the database in the API container, then starts API, worker, MCP, and web services. Its local endpoints are:

| Service | Bind/port behavior | Verification |
| --- | --- | --- |
| Web | Host `3000` to container `3000` | `http://localhost:3000/login` |
| API | `0.0.0.0`; `PORT` or default `4000` | `http://localhost:4000/health` returns `{"ok":true}` |
| MCP | `0.0.0.0`; `PORT` or default `4100` | `http://localhost:4100/health` returns `{"ok":true}`; JSON-RPC is at `/mcp` |
| Worker | No listening port | Inspect worker startup/job logs |
| PostgreSQL | Host `15432` to container `5432` | Compose uses `pg_isready` |
| Redis | Host `16379` to container `6379` | Confirm the container/service is running |
| MinIO | Host API `19000`, console `19001` | Confirm the container/service is running |

Host-only development is also supported, but dependencies and environment must be ready first:

1. Start PostgreSQL, Redis, and MinIO.
2. Export the values from `.env.example`, adjusted to the actual service addresses.
3. Run `pnpm db:migrate`.
4. Start the API before consumers with `pnpm --filter @personal-context-os/api dev`.
5. Start `pnpm --filter @personal-context-os/worker dev`, `pnpm --filter @personal-context-os/mcp-server dev`, and `pnpm --filter @personal-context-os/web dev` as needed.

When host processes use the Compose dependency containers, the repository's published addresses are PostgreSQL `localhost:15432`, Redis `localhost:16379`, and MinIO `http://localhost:19000`; `.env.example` instead uses the standard host ports `5432`, `6379`, and `9000`, so adjust the exported URLs deliberately. `pnpm dev` starts every workspace development script in parallel, but it does not start dependencies or run migrations and does not enforce application startup order.

Port selection is not uniform:

- API and MCP use `PORT` when set, otherwise `4000` and `4100`. They fail on a port conflict and do not select another port.
- Next development uses `PORT` when set. Without it, it starts at `3000` and may retry an available nearby port when `3000` is occupied. Always read startup output and report the actual URL. Next production start defaults to `3000` unless `PORT` or `-p` is supplied.
- All three HTTP development servers bind `0.0.0.0` through their source or package scripts.

Before starting a server, inspect the expected port, owning process, repository association, and health. Reuse a healthy project-owned server. Do not create duplicate servers, kill unrelated processes, broadly terminate all Node processes, or silently move a fixed-port service.

## Builds, production processes, and deployment

- Production build: `pnpm build` (`pnpm -r build`).
- Direct compiled service starts require a successful build: each backend package uses its `start` script, and web uses `next start`.
- Render uses `pnpm render:start:api`, `pnpm render:start:mcp`, `pnpm render:start:web`, and `pnpm render:start:worker`. The API Render launcher runs migrations before starting. Render sets HTTP service `PORT=10000`; the web Render launcher also defaults to `10000` if it is unset.
- `render.yaml` defines the production Render Blueprint: web, API, MCP, worker, PostgreSQL, Redis, and the shared environment group. HTTP health paths are `/login` for web and `/health` for API/MCP.
- Render services use commit-triggered auto-deploy. The exact tracked branch is external Render configuration, not stored here. Treat pushes to a Render-tracked branch, especially `main`, as potentially deployment-triggering; never push or merge to it without explicit authorization for that effect.

## Hot reload and restart policy

- Host web development uses Next hot-code reload.
- Host API, worker, and MCP development use `tsx watch` and restart on watched source changes.
- Shared packages use `tsc --watch`; when shared output changes, verify that the consuming app watcher actually reloaded it.
- Compose has no source bind mounts. Host source edits are not propagated into an existing Compose container; rebuild/recreate the affected image/service with the canonical Compose workflow.

Do not restart automatically after every edit. Documentation and isolated test changes need no restart. Use watcher output and runtime behavior to decide. Restart the exact project-owned process after environment, dependency/lockfile, startup-only configuration, migration/bootstrap, build-tooling, unwatched shared-package, stale, or crashed-process changes. When restarting, stop only that process and its project-owned children, wait for its port/resource to release, start it with the canonical command, inspect startup errors and the actual port, then run the health or behavior check.

## Database changes

- Canonical migration command: `pnpm db:migrate`.
- SQL migrations live in `packages/db/migrations` and are applied in filename order by `packages/db/src/migrate.ts`.
- Full Compose and `pnpm render:start:api` run migrations before API startup; host-only development does not.
- Inspect migration behavior and existing schema conventions before editing. Do not run destructive database operations without explicit authorization.

## Validation commands

Use the narrowest relevant check first, then broaden according to risk.

- Focused tests can be run through the owning package, for example:
  - `pnpm --filter @personal-context-os/ai test -- src/heuristic-normalizer.test.ts`
  - `pnpm --filter @personal-context-os/api test -- src/services/tasks.test.ts`
  - `pnpm --filter @personal-context-os/mcp-server test -- src/auth.test.ts`
- All workspace tests: `pnpm test`. This first runs the full build and then every package test script.
- Static check/lint: `pnpm lint`. The current lint scripts are TypeScript `--noEmit` checks; there is no ESLint configuration.
- Typecheck: `pnpm typecheck`. At the root this currently aliases `pnpm build`, so it emits/builds rather than being a separate no-emit check.
- Production build: `pnpm build`.
- There is no configured formatter or Markdown/documentation checker. Preserve the existing two-space TypeScript/JSON style, semicolons, and double quotes; validate documentation through diff review and command/path verification.
- No GitHub Actions or other repository CI workflow is checked in. Local relevant checks are therefore the available gate before commit/push.

Always inspect the final diff and run checks covering changed behavior. Do not hide, bypass, disable, or weaken failures. If a check cannot run, name it, explain the blocker, state what was verified instead, and mark the result as not fully verified.

## Implementation standards

- Follow existing architecture, naming, formatting, error handling, and validation patterns.
- Preserve the API as the canonical business boundary and keep MCP scope enforcement/auditing intact.
- Preserve immutable raw capture behavior and authentication boundaries unless the task explicitly changes them.
- Add or update focused tests when behavior changes and practical coverage exists.
- Handle failures explicitly; do not expose secrets or sensitive data.
- Do not add production dependencies without a demonstrated need.
- Do not manually edit generated output (`dist`, `.next`, coverage, TypeScript build info) or commit it. Use official build/generation commands.

## Git, branches, commits, and pushes

- Remote: `origin` is `git@github.com:razbitton/MindSystem.git`.
- Default branch: `main` (`origin/HEAD` points to `origin/main`).
- No documented branch policy or commit-message convention exists, and recent history is informal. For substantial agent work, use a focused branch such as `fix/short-description`, `feat/short-description`, or `chore/short-description`; do not merge automatically. For commits, use a concise conventional prefix (`fix:`, `feat:`, `refactor:`, `test:`, `docs:`, or `chore:`) unless a newer repository convention is documented.
- Before staging or committing, rerun `git status`, inspect the task diff, and stage explicit task-owned paths only. Never use `git add -A` in a mixed worktree.
- Commit only logically complete, validated work. Check staged content for unrelated files and secrets.
- Push only the current task branch after relevant checks pass and destination/authentication are clear. Pushing does not authorize merging, releasing, or deploying.
- Never force-push, rewrite published history, use `git reset --hard`, discard uncommitted work, delete branches/tags, bypass protection, merge to `main`, deploy production, or perform destructive database actions without explicit user authorization.
- Do not pull, merge, or rebase when doing so could disturb pre-existing user work.

## Durable learning and completion reports

Update this file when verified, durable repository behavior changes: commands, ports, health checks, service order, migrations, watcher/restart rules, validation, deployment, branch policy, or architectural boundaries. Do not record task-specific state, transient failures, guesses, credentials, or personal data. Keep this file concise and remove contradictions rather than appending duplicates.

At task completion, report: files and behavior changed; root cause when relevant; each validation command and result; whether a development server was started or restarted and why; detected development command, actual port, and health result when applicable; current branch; commit hash if created; push result; and all limitations or unverified items.
