import type { AnyRecord } from "./api";

export const sessionAuthenticatedEvent = "mindsystem:session-authenticated";

export function emitSessionAuthenticated(user: AnyRecord) {
  window.dispatchEvent(
    new CustomEvent(sessionAuthenticatedEvent, {
      detail: { user }
    })
  );
}
