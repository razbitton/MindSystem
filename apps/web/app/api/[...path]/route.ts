import type { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const hopByHopHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyApiRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyApiRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyApiRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyApiRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyApiRequest(request, context);
}

async function proxyApiRequest(request: NextRequest, context: RouteContext) {
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";
  const { path = [] } = await context.params;
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, apiBaseUrl);
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual"
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const responseHeaders = copyResponseHeaders(upstream.headers);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

function copyResponseHeaders(headers: Headers) {
  const responseHeaders = new Headers();
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (!hopByHopHeaders.has(lowerKey) && lowerKey !== "set-cookie") {
      responseHeaders.set(key, value);
    }
  });

  const cookieHeaders = getSetCookieHeaders(headers);
  for (const cookie of cookieHeaders) {
    responseHeaders.append("set-cookie", cookie);
  }

  return responseHeaders;
}

function getSetCookieHeaders(headers: Headers) {
  const withCookieAccessor = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = withCookieAccessor.getSetCookie?.();
  if (cookies?.length) return cookies;

  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}
