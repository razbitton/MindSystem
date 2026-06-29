import { documents, entities } from "@personal-context-os/db";
import { patchDocumentSchema, type CreateDocumentInput, type UploadDocumentInput } from "@personal-context-os/shared";
import { CreateBucketCommand, GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { createGenericEntity } from "./entities.js";
import { writeAuditEvent } from "./audit.js";
import type { z } from "zod";
import type { Actor } from "./types.js";
import type { AppContext } from "./types.js";

type DocumentFileDisposition = "inline" | "attachment";

export const DOCUMENT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const DOCUMENT_UPLOAD_BODY_LIMIT_BYTES = Math.ceil(DOCUMENT_UPLOAD_MAX_BYTES * 1.4) + 100_000;

export class DocumentFileError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
  }
}

export function isDocumentFileError(error: unknown): error is DocumentFileError {
  return error instanceof DocumentFileError;
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

export async function uploadDocument(context: AppContext, input: UploadDocumentInput, actor: Actor) {
  const body = decodeUploadedDocument(input.file.dataBase64);
  const contentType = normalizedContentType(input.file.mimeType) ?? "application/octet-stream";
  const objectKey = documentObjectKey(context.workspaceId, input.file.name);

  await putDocumentObject(context, {
    key: objectKey,
    body,
    contentType
  });

  const documentInput: CreateDocumentInput = {
    title: input.title,
    projectId: input.projectId ?? null,
    objectKey,
    mimeType: contentType
  };
  if (input.extractedText !== undefined) documentInput.extractedText = input.extractedText;

  return createDocument(context, documentInput, actor);
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

  const object = await fetchDocumentObject(context, objectKey);
  const body = object.body;
  const contentType = document.mimeType || object.contentType || "application/octet-stream";
  const filename = documentFilename(document.title, objectKey, contentType);
  const headers: Record<string, string> = {
    "content-type": contentType,
    "content-disposition": contentDisposition(disposition, filename),
    "cache-control": "private, max-age=60"
  };
  headers["content-length"] = object.contentLength !== undefined ? String(object.contentLength) : String(body.byteLength);

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

async function putDocumentObject(
  context: AppContext,
  input: {
    key: string;
    body: Buffer;
    contentType: string;
  }
) {
  const client = createS3Client(context);
  const command = new PutObjectCommand({
    Bucket: context.env.S3_BUCKET,
    Key: input.key,
    Body: input.body,
    ContentLength: input.body.byteLength,
    ContentType: input.contentType
  });

  try {
    try {
      await client.send(command);
    } catch (error) {
      if (!isMissingBucketError(error)) throw error;
      await client.send(new CreateBucketCommand({ Bucket: context.env.S3_BUCKET }));
      await client.send(command);
    }
  } catch (error) {
    if (error instanceof S3ServiceException) {
      const code = error.name || "S3Error";
      throw new DocumentFileError(`Could not store document file (${code})`, 502);
    }
    throw new DocumentFileError("Could not store document file", 502);
  } finally {
    client.destroy();
  }
}

async function fetchDocumentObject(context: AppContext, objectKey: string) {
  const key = normalizeObjectKey(context, objectKey);
  const client = createS3Client(context);

  try {
    const object = await client.send(
      new GetObjectCommand({
        Bucket: context.env.S3_BUCKET,
        Key: key
      })
    );

    return {
      body: await streamToBuffer(object.Body),
      contentLength: object.ContentLength,
      contentType: object.ContentType
    };
  } catch (error) {
    if (error instanceof S3ServiceException) {
      const code = error.name || "S3Error";
      const statusCode = error.$metadata.httpStatusCode;
      if (statusCode === 404 || code === "NoSuchKey" || code === "NotFound") {
        throw new DocumentFileError("Document file not found", 404);
      }
      throw new DocumentFileError(`Could not retrieve document file from storage (${code})`, 502);
    }
    throw new DocumentFileError("Could not retrieve document file from storage", 502);
  } finally {
    client.destroy();
  }
}

function isMissingBucketError(error: unknown) {
  if (!(error instanceof S3ServiceException)) return false;
  return error.name === "NoSuchBucket" || error.$metadata.httpStatusCode === 404;
}

function createS3Client(context: AppContext) {
  return new S3Client({
    region: s3SigningRegion(context.env.S3_ENDPOINT, context.env.S3_REGION),
    endpoint: context.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: context.env.S3_ACCESS_KEY,
      secretAccessKey: context.env.S3_SECRET_KEY
    }
  });
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

function decodeUploadedDocument(value: string) {
  const base64Payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const normalized = base64Payload.replace(/\s/g, "");
  if (!normalized || normalized.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(normalized)) {
    throw new DocumentFileError("Uploaded document payload is not valid base64", 400);
  }

  const body = Buffer.from(normalized, "base64");
  if (!body.byteLength) {
    throw new DocumentFileError("Uploaded document file is empty", 400);
  }
  if (body.byteLength > DOCUMENT_UPLOAD_MAX_BYTES) {
    throw new DocumentFileError("Uploaded document file is too large", 413);
  }

  return body;
}

function documentObjectKey(workspaceId: string, fileName: string) {
  const safeFileName = sanitizeFilename(fileName.split(/[\\/]/).filter(Boolean).at(-1) ?? fileName).slice(0, 160);
  return `workspaces/${workspaceId}/documents/${randomUUID()}-${safeFileName || "document"}`;
}

function normalizedContentType(value: string | undefined) {
  const contentType = value?.split(";")[0]?.trim().toLowerCase();
  return contentType || null;
}

async function streamToBuffer(body: unknown) {
  if (!body) return Buffer.alloc(0);

  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof transformable.transformToByteArray === "function") {
    return Buffer.from(await transformable.transformToByteArray());
  }

  if (body instanceof Uint8Array) return Buffer.from(body);

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new DocumentFileError("Could not read document file stream", 502);
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
