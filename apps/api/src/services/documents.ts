import { documents, entities } from "@personal-context-os/db";
import { patchDocumentSchema, type CreateDocumentInput } from "@personal-context-os/shared";
import { and, desc, eq } from "drizzle-orm";
import { createHash, createHmac } from "node:crypto";
import { createGenericEntity } from "./entities.js";
import { writeAuditEvent } from "./audit.js";
import type { z } from "zod";
import type { Actor } from "./types.js";
import type { AppContext } from "./types.js";

type DocumentFileDisposition = "inline" | "attachment";

class DocumentFileError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
  }
}

export async function createDocument(context: AppContext, input: CreateDocumentInput, actor: Actor) {
  const entity = await createGenericEntity(context, {
    entityType: "document",
    title: input.title,
    summary: input.extractedText?.slice(0, 180) ?? input.objectKey ?? null,
    body: input.extractedText ?? null,
    canonical: input,
    customFields: {}
  });

  const [document] = await context.db
    .insert(documents)
    .values({
      workspaceId: context.workspaceId,
      entityId: entity.id,
      projectId: input.projectId ?? null,
      title: input.title,
      objectKey: input.objectKey ?? null,
      mimeType: input.mimeType ?? null,
      extractedText: input.extractedText ?? null
    })
    .returning();

  await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, metadata: { entityType: "document" } });
  return { document, entity };
}

export async function listDocuments(context: AppContext) {
  const rows = await context.db
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, context.workspaceId))
    .orderBy(desc(documents.updatedAt))
    .limit(200);

  return { documents: rows };
}

export async function getDocument(context: AppContext, id: string) {
  const [document] = await context.db
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceId, context.workspaceId), eq(documents.id, id)))
    .limit(1);

  if (!document) throw new Error("Document not found");
  return { document };
}

export async function getDocumentFile(context: AppContext, id: string, disposition: DocumentFileDisposition = "attachment") {
  const { document } = await getDocument(context, id);
  const objectKey = String(document.objectKey ?? "").trim();
  if (!objectKey) throw new DocumentFileError("Document file is not available", 404);

  const response = await fetchDocumentObject(context, objectKey).catch((error: unknown) => {
    if (error instanceof DocumentFileError) throw error;
    throw new DocumentFileError("Could not retrieve document file", 502);
  });
  if (!response.ok) {
    const statusCode = response.status === 404 ? 404 : 502;
    throw new DocumentFileError(response.status === 404 ? "Document file not found" : "Could not retrieve document file", statusCode);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const contentType = document.mimeType || response.headers.get("content-type") || "application/octet-stream";
  const filename = documentFilename(document.title, objectKey, contentType);
  const headers: Record<string, string> = {
    "content-type": contentType,
    "content-disposition": contentDisposition(disposition, filename),
    "cache-control": "private, max-age=60"
  };
  const contentLength = response.headers.get("content-length");
  headers["content-length"] = contentLength ?? String(body.byteLength);

  return {
    body,
    headers
  };
}

export async function patchDocument(context: AppContext, id: string, input: z.infer<typeof patchDocumentSchema>, actor: Actor) {
  const updates: Partial<typeof documents.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.projectId !== undefined) updates.projectId = input.projectId;
  if (input.objectKey !== undefined) updates.objectKey = input.objectKey;
  if (input.mimeType !== undefined) updates.mimeType = input.mimeType;
  if (input.extractedText !== undefined) updates.extractedText = input.extractedText;

  const [document] = await context.db
    .update(documents)
    .set(updates)
    .where(and(eq(documents.workspaceId, context.workspaceId), eq(documents.id, id)))
    .returning();

  if (!document) throw new Error("Document not found");

  await context.db
    .update(entities)
    .set({
      title: document.title,
      summary: document.extractedText?.slice(0, 180) ?? document.objectKey ?? null,
      body: document.extractedText ?? null,
      updatedAt: new Date()
    })
    .where(eq(entities.id, document.entityId));

  await writeAuditEvent(context, { ...actor, action: "update entity", entityId: document.entityId, metadata: { entityType: "document" } });
  return { document };
}

export async function deleteDocument(context: AppContext, id: string, actor: Actor) {
  const { document } = await getDocument(context, id);

  await writeAuditEvent(context, {
    ...actor,
    action: "delete entity",
    entityId: document.entityId,
    metadata: { entityType: "document", documentId: id, title: document.title }
  });

  await context.db
    .delete(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.id, document.entityId)));

  return { ok: true };
}

async function fetchDocumentObject(context: AppContext, objectKey: string) {
  const objectUrl = objectStorageUrl(context, normalizeObjectKey(context, objectKey));
  const headers = signedS3Headers(context, objectUrl, "GET");
  return fetch(objectUrl, { headers });
}

function normalizeObjectKey(context: AppContext, objectKey: string) {
  const trimmedObjectKey = objectKey.trim().replace(/^\/+/, "");
  const directUrl = tryParseHttpUrl(trimmedObjectKey);
  if (!directUrl) return trimBucketPrefix(context, trimmedObjectKey);

  const endpoint = new URL(context.env.S3_ENDPOINT);
  if (directUrl.origin !== endpoint.origin) {
    throw new DocumentFileError("Document file location is not allowed", 400);
  }

  const endpointPath = trimTrailingSlash(endpoint.pathname);
  const bucketPrefix = `${endpointPath}/${encodeURIComponent(context.env.S3_BUCKET)}/`;
  if (!directUrl.pathname.startsWith(bucketPrefix)) {
    throw new DocumentFileError("Document file location is not allowed", 400);
  }

  return directUrl.pathname.slice(bucketPrefix.length).split("/").map(decodeURIComponent).join("/");
}

function trimBucketPrefix(context: AppContext, objectKey: string) {
  const bucketPrefix = `${context.env.S3_BUCKET}/`;
  return objectKey.startsWith(bucketPrefix) ? objectKey.slice(bucketPrefix.length) : objectKey;
}

function objectStorageUrl(context: AppContext, objectKey: string) {
  const endpoint = new URL(context.env.S3_ENDPOINT);
  const bucket = encodeURIComponent(context.env.S3_BUCKET);
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  return new URL(`${trimTrailingSlash(endpoint.pathname)}/${bucket}/${encodedKey}`, endpoint.origin);
}

function signedS3Headers(context: AppContext, url: URL, method: "GET") {
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const service = "s3";
  const region = s3SigningRegion(context.env.S3_ENDPOINT, context.env.S3_REGION);
  const host = url.host;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = s3SigningKey(context.env.S3_SECRET_KEY, dateStamp, region, service);
  const signature = hmacHex(signingKey, stringToSign);

  return {
    host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    authorization: `AWS4-HMAC-SHA256 Credential=${context.env.S3_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

export function s3SigningRegion(endpoint: string, configuredRegion: string) {
  const region = configuredRegion.trim() || "us-east-1";
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    if (hostname.endsWith(".r2.cloudflarestorage.com") && region === "us-east-1") {
      return "auto";
    }
  } catch {
    return region;
  }

  return region;
}

function s3SigningKey(secretKey: string, dateStamp: string, region: string, service: string) {
  const dateKey = hmacBuffer(`AWS4${secretKey}`, dateStamp);
  const dateRegionKey = hmacBuffer(dateKey, region);
  const dateRegionServiceKey = hmacBuffer(dateRegionKey, service);
  return hmacBuffer(dateRegionServiceKey, "aws4_request");
}

function hmacBuffer(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function tryParseHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function documentFilename(title: string, objectKey: string, contentType: string) {
  const objectName = objectKey.split("/").filter(Boolean).at(-1) ?? "";
  const fallbackExtension = extensionForContentType(contentType);
  const rawName = title || objectName || "document";
  const hasExtension = /\.[A-Za-z0-9]{1,8}$/.test(rawName);
  return sanitizeFilename(hasExtension ? rawName : `${rawName}${fallbackExtension}`);
}

function extensionForContentType(contentType: string) {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  if (normalized === "application/pdf") return ".pdf";
  if (normalized === "text/plain") return ".txt";
  if (normalized === "text/html") return ".html";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "application/json") return ".json";
  return "";
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim() || "document";
}

function contentDisposition(disposition: DocumentFileDisposition, filename: string) {
  const escaped = filename.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${disposition}; filename="${escaped}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
