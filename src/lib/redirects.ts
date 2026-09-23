/* ==========================================================================
   Where a redirect is allowed to send somebody.
   --------------------------------------------------------------------------
   `?next=` is attacker-controlled. `/sign-in?next=https://evil.example/` sent
   a user who had just typed their password straight to somebody else's site,
   arriving from the host they trusted — which is the whole value of an open
   redirect to a phisher.

   Dependency-free on purpose: a client component imports this, and `env.ts`
   reads the database URL at module scope.
   ========================================================================== */

/** Longer than any route this app generates, and short enough to bound the work. */
const MAX_LENGTH = 2048;

/**
 * A `next=` value reduced to a path this site will serve, or the fallback.
 *
 * Only a path is accepted, and only one that cannot be read as an authority:
 *
 * - `//evil.example` is protocol-relative and leaves the site.
 * - `/\evil.example` does too, because browsers normalise a backslash to a
 *   slash before resolving — so it is `//evil.example` by the time it matters.
 * - `/%2f%2fevil.example` and `/%5c` are the same two, encoded.
 * - A control character can truncate the value inside a header.
 *
 * With `origin` supplied the caller may also pass an absolute URL, which is
 * accepted only when it is this site's own and is reduced to its path. That
 * exists for the checkout return, where the URL genuinely is absolute.
 */
export function safeInternalPath(
  raw: unknown,
  fallback = "/dashboard",
  options: { origin?: string } = {},
): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_LENGTH) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  if (value.startsWith("/")) return isSafePath(value) ? value : fallback;

  if (options.origin) {
    try {
      const url = new URL(value);
      if (url.origin !== new URL(options.origin).origin) return fallback;
      const path = `${url.pathname}${url.search}${url.hash}`;
      return isSafePath(path) ? path : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function isSafePath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  // Anything that resolves to an authority rather than a path on this host.
  const rest = path.slice(1).toLowerCase();
  return !(
    rest.startsWith("/") ||
    rest.startsWith("\\") ||
    rest.startsWith("%2f") ||
    rest.startsWith("%5c")
  );
}
