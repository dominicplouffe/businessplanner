import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { withNativeLoopbackDefault } from "@/lib/mcp/registration";

const handler = toNextJsHandler(auth);

export const { GET } = handler;

/** Everything goes to Better Auth. Client registration is first given the
 *  application type its redirects imply — see `lib/mcp/registration.ts`. */
export async function POST(request: Request) {
  if (!new URL(request.url).pathname.endsWith("/oauth2/register")) return handler.POST(request);

  const body = await request.json().catch(() => undefined);
  const adjusted = withNativeLoopbackDefault(body);
  return handler.POST(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: body === undefined ? null : JSON.stringify(adjusted),
    }),
  );
}
