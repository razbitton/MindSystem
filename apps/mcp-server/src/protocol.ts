export interface JsonRpcEnvelope {
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export function isAcceptedClientNotification(message: unknown) {
  if (!isJsonRpcEnvelope(message)) return false;
  return message.id === undefined && typeof message.method === "string" && message.method.startsWith("notifications/");
}

function isJsonRpcEnvelope(message: unknown): message is JsonRpcEnvelope {
  return typeof message === "object" && message !== null && !Array.isArray(message);
}
