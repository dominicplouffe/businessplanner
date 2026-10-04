/* ==========================================================================
   Dynamic client registration, as MCP clients actually send it.
   --------------------------------------------------------------------------
   OIDC registration says an omitted `application_type` means "web", and a web
   client may not redirect to a loopback address. A command-line MCP client —
   Claude Code, an IDE, the inspector — listens on http://localhost:<port> for
   its callback and often omits the field, so the library refuses it with
   "web clients require https redirect URIs".

   A client whose every redirect is an http loopback address is a native
   application by definition (RFC 8252 §7.3), so that is what it is recorded
   as when it did not say. A client that declared a type keeps it, and a
   registration with any other redirect is passed through untouched — the
   library's own checks still decide everything else.
   ========================================================================== */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isHttpLoopback(uri: unknown): boolean {
  if (typeof uri !== "string") return false;
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function withNativeLoopbackDefault(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const request = body as Record<string, unknown>;
  if (request.application_type !== undefined) return body;
  const uris = request.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every(isHttpLoopback)) return body;
  return { ...request, application_type: "native" };
}
