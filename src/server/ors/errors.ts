export type OrsErrorKind =
  | "rate_limited"
  | "unauthorized"
  | "bad_request"
  | "not_found"
  | "upstream";

/**
 * Typed ORS failure. Messages are built only from status codes and our own
 * text; never from request URLs, headers or upstream bodies, so the API key
 * cannot leak through them.
 */
export class OrsError extends Error {
  readonly kind: OrsErrorKind;
  readonly retryAfterSeconds?: number;

  constructor(kind: OrsErrorKind, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "OrsError";
    this.kind = kind;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}
