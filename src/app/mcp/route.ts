import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate } from "@/lib/mcp/auth";
import { registerTools } from "@/lib/mcp/tools";
import { brand } from "@/lib/brand";

/* The MCP endpoint: Streamable HTTP, stateless.

   Stateless because every request carries its own token and nothing about a
   conversation lives here — the plan is in the database. That keeps it working
   behind a restart, a redeploy or a second container without a session store,
   and is why GET (the server-to-client stream) answers 405: there is no
   session for it to belong to. JSON responses rather than SSE, because no tool
   streams and a plain response passes every proxy unchanged. */

export const dynamic = "force-dynamic";
// generate_section waits on the model, like the app's own generation route.
export const maxDuration = 300;

const INSTRUCTIONS = `Venturelly builds business plans whose numbers come from a deterministic financial engine, never from a model.

How to build a plan:
1. get_intake_questions, then ask the person those questions. Do not answer for them; where they do not know, leave the industry default and say so.
2. create_plan, then answer_intake as answers arrive (mark each source honestly: known or estimated). Pass complete: true when the required questions are answered.
3. get_financials to see what the engine computed, and review_plan to see what a lender or investor would object to. Fix assumptions with answer_intake, not by editing figures.
4. Write each section: either generate_section, or get_section_brief and write it yourself then write_section. Prose may only contain figures from the brief or from a citation added with add_citation.
5. The person exports the finished plan from the plan's export page in the app.`;

async function handle(request: Request): Promise<Response> {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;

  const server = new McpServer(
    { name: brand.name, version: "1.0.0", websiteUrl: brand.url },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, caller);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
