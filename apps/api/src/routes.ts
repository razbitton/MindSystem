import {
  agentScopeSchema,
  buildOpenApiSpec,
  createAgentTokenSchema,
  createDocumentSchema,
  createNoteSchema,
  createProjectSchema,
  createTaskSchema,
  ingestFreeTextSchema,
  hasScope,
  loginSchema,
  patchNoteSchema,
  patchProjectSchema,
  patchTaskSchema,
  reviewDecisionSchema,
  searchQuerySchema,
  type AgentScope
} from "@personal-context-os/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createAgentToken, listAgentState } from "./services/agents.js";
import { listAuditEvents } from "./services/audit.js";
import {
  authenticateAgentBearer,
  authenticateSessionToken,
  buildExpiredSessionCookie,
  buildSessionCookie,
  loginWithPassword,
  readBearerToken,
  readCookie,
  sessionCookieName,
  type RequestIdentity
} from "./services/auth.js";
import { getDashboard } from "./services/dashboard.js";
import { ingestFreeText } from "./services/ingest.js";
import { createDocument, getDocument, listDocuments } from "./services/documents.js";
import {
  createNote,
  getNote,
  listNotes,
  patchNote
} from "./services/notes.js";
import {
  createProject,
  getProject,
  getProjectContext,
  listProjects,
  patchProject
} from "./services/projects.js";
import {
  approveReviewItem,
  listReviewQueue,
  rejectReviewItem
} from "./services/review.js";
import { searchMemory } from "./services/search.js";
import {
  completeTask,
  createTask,
  getTask,
  listTasks,
  patchTask
} from "./services/tasks.js";
import type { Actor, AppContext } from "./services/types.js";

const idParam = z.object({ id: z.string().uuid() });
type AuthenticatedRequest = FastifyRequest & { identity: RequestIdentity };

const publicPaths = new Set([
  "/health",
  "/api/openapi.json",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me"
]);

function isPublicRequest(request: FastifyRequest) {
  const path = request.url.split("?")[0] ?? request.url;
  return request.method === "OPTIONS" || publicPaths.has(path);
}

async function authenticateRequest(app: FastifyInstance, request: FastifyRequest): Promise<RequestIdentity | null> {
  const cookieToken = readCookie(request.headers.cookie, sessionCookieName);
  const bearerToken = readBearerToken(Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization);

  return (
    (await authenticateSessionToken(app.context, cookieToken)) ??
    (await authenticateAgentBearer(app.context, bearerToken))
  );
}

function requestContext(app: FastifyInstance, request: FastifyRequest): AppContext {
  const identity = (request as AuthenticatedRequest).identity;
  return {
    ...app.context,
    workspaceId: identity.workspaceId,
    userId: identity.kind === "user" ? identity.id : null
  };
}

function actorFor(request: FastifyRequest): Actor {
  const identity = (request as AuthenticatedRequest).identity;
  return {
    actorType: identity.kind,
    actorId: identity.id
  };
}

function requiredAgentScopeFor(request: FastifyRequest): AgentScope | null {
  const route = request.routeOptions.url ?? request.url.split("?")[0] ?? "";
  const method = request.method;

  if (route === "/api/search" && method === "GET") return "memory:read";
  if (route === "/api/ingest/free-text" && method === "POST") return "memory:write";
  if (route === "/api/dashboard/today" && method === "GET") return "memory:read";

  if (route === "/api/projects" && method === "GET") return "projects:read";
  if (route === "/api/projects" && method === "POST") return "projects:write";
  if (route === "/api/projects/:id" && method === "GET") return "projects:read";
  if (route === "/api/projects/:id" && method === "PATCH") return "projects:write";
  if (route === "/api/projects/:id/context" && method === "GET") return "projects:read";

  if (route === "/api/tasks" && method === "GET") return "tasks:read";
  if (route === "/api/tasks" && method === "POST") return "tasks:write";
  if (route === "/api/tasks/:id" && method === "GET") return "tasks:read";
  if (route === "/api/tasks/:id" && method === "PATCH") return "tasks:write";
  if (route === "/api/tasks/:id/complete" && method === "POST") return "tasks:write";

  if (route === "/api/notes" && method === "GET") return "memory:read";
  if (route === "/api/notes" && method === "POST") return "memory:write";
  if (route === "/api/notes/:id" && method === "GET") return "memory:read";
  if (route === "/api/notes/:id" && method === "PATCH") return "memory:write";

  if (route === "/api/documents" && method === "GET") return "documents:read";
  if (route === "/api/documents" && method === "POST") return "documents:write";
  if (route === "/api/documents/:id" && method === "GET") return "documents:read";

  if (route === "/api/agents" || route === "/api/agents/tokens" || route === "/api/audit-events") return "admin";
  if (route.startsWith("/api/review-queue")) return "admin";

  return null;
}

export async function registerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    if (isPublicRequest(request)) return;

    const identity = await authenticateRequest(app, request);
    if (!identity) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    if (identity.kind === "agent") {
      const requiredScope = requiredAgentScopeFor(request);
      if (!requiredScope || !hasScope(identity.scopes, requiredScope)) {
        return reply.code(403).send({ error: requiredScope ? `Missing required scope: ${requiredScope}` : "Agent access is not allowed for this route" });
      }
    }

    (request as AuthenticatedRequest).identity = identity;
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/openapi.json", async () => buildOpenApiSpec());

  app.post("/api/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const session = await loginWithPassword(app.context, input);
    if (!session) {
      reply.code(401);
      return { error: "Invalid email or password" };
    }

    reply.header("set-cookie", buildSessionCookie(app.context.env, session.token));
    return { user: session.user, expiresAt: session.expiresAt };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const identity = await authenticateRequest(app, request);
    if (!identity || identity.kind !== "user") {
      reply.code(401);
      return { error: "Authentication required" };
    }

    return {
      user: {
        id: identity.id,
        workspaceId: identity.workspaceId,
        email: identity.email,
        displayName: identity.displayName
      }
    };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.header("set-cookie", buildExpiredSessionCookie(app.context.env));
    return { ok: true };
  });

  app.post("/api/ingest/free-text", async (request) => {
    const input = ingestFreeTextSchema.parse(request.body);
    return ingestFreeText(requestContext(app, request), input, actorFor(request));
  });

  app.get("/api/search", async (request) => {
    const query = searchQuerySchema.parse(request.query);
    return searchMemory(requestContext(app, request), query);
  });

  app.post("/api/projects", async (request) => {
    const input = createProjectSchema.parse(request.body);
    return createProject(requestContext(app, request), input, actorFor(request));
  });

  app.get("/api/projects", async (request) => listProjects(requestContext(app, request)));

  app.get("/api/projects/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    return getProject(requestContext(app, request), id);
  });

  app.get("/api/projects/:id/context", async (request) => {
    const { id } = idParam.parse(request.params);
    return getProjectContext(requestContext(app, request), id);
  });

  app.patch("/api/projects/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const input = patchProjectSchema.parse(request.body);
    return patchProject(requestContext(app, request), id, input, actorFor(request));
  });

  app.post("/api/tasks", async (request) => {
    const input = createTaskSchema.parse(request.body);
    return createTask(requestContext(app, request), input, actorFor(request));
  });

  app.get("/api/tasks", async (request) => listTasks(requestContext(app, request), request.query));

  app.get("/api/tasks/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    return getTask(requestContext(app, request), id);
  });

  app.patch("/api/tasks/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const input = patchTaskSchema.parse(request.body);
    return patchTask(requestContext(app, request), id, input, actorFor(request));
  });

  app.post("/api/tasks/:id/complete", async (request) => {
    const { id } = idParam.parse(request.params);
    return completeTask(requestContext(app, request), id, actorFor(request));
  });

  app.post("/api/notes", async (request) => {
    const input = createNoteSchema.parse(request.body);
    return createNote(requestContext(app, request), input, actorFor(request));
  });

  app.get("/api/notes", async (request) => listNotes(requestContext(app, request), request.query));

  app.get("/api/notes/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    return getNote(requestContext(app, request), id);
  });

  app.patch("/api/notes/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const input = patchNoteSchema.parse(request.body);
    return patchNote(requestContext(app, request), id, input, actorFor(request));
  });

  app.post("/api/documents", async (request) => {
    const input = createDocumentSchema.parse(request.body);
    return createDocument(requestContext(app, request), input, actorFor(request));
  });

  app.get("/api/documents", async (request) => listDocuments(requestContext(app, request)));

  app.get("/api/documents/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    return getDocument(requestContext(app, request), id);
  });

  app.get("/api/dashboard/today", async (request) => getDashboard(requestContext(app, request)));

  app.get("/api/review-queue", async (request) => listReviewQueue(requestContext(app, request)));

  app.post("/api/review-queue/:id/approve", async (request) => {
    const { id } = idParam.parse(request.params);
    const input = reviewDecisionSchema.parse(request.body ?? {});
    return approveReviewItem(requestContext(app, request), id, input, actorFor(request));
  });

  app.post("/api/review-queue/:id/reject", async (request) => {
    const { id } = idParam.parse(request.params);
    return rejectReviewItem(requestContext(app, request), id, actorFor(request));
  });

  app.get("/api/agents", async (request) => listAgentState(requestContext(app, request)));

  app.post("/api/agents/tokens", async (request) => {
    const input = createAgentTokenSchema.parse(request.body);
    const scopes = input.scopes.map((scope) => agentScopeSchema.parse(scope));
    return createAgentToken(requestContext(app, request), { ...input, scopes }, actorFor(request));
  });

  app.get("/api/audit-events", async (request) => listAuditEvents(requestContext(app, request)));
}
