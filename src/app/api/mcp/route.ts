/**
 * MCP Streamable HTTP endpoint (stateless). One server+transport per request.
 * Auth: `Authorization: Bearer pf_sk_…` or (if enabled in settings) unauthenticated loopback.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPlanfastServer } from "@/lib/mcp/server";
import { authorize } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";

function unauthorized(msg: string) {
  return Response.json({ jsonrpc: "2.0", error: { code: -32001, message: msg }, id: null }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="planfast"' } });
}

async function handle(req: Request) {
  const err = authorize(req);
  if (err) return unauthorized(err);
  try {
    const server = createPlanfastServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const res = await transport.handleRequest(req);
    // stateless: tear down once the response body has been produced
    void res.clone().arrayBuffer().finally(() => transport.close().catch(() => {}));
    return res;
  } catch (e) {
    console.error("[mcp]", e);
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: (e as Error).message ?? "internal error" }, id: null }, { status: 500 });
  }
}

export const POST = handle;
export const GET = async () => Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST (stateless Streamable HTTP)." }, id: null }, { status: 405, headers: { Allow: "POST" } });
export const DELETE = GET;
