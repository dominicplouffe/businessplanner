import { protectedResourceMetadata } from "@/lib/mcp/auth";

/* RFC 9728: where an MCP client learns which authorization server issues
   tokens for /mcp. The 401 from /mcp names this address. */
export async function GET() {
  return Response.json(await protectedResourceMetadata(), {
    headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}
