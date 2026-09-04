import { apiKeys, appSettings } from "@/lib/repo";
import { mask } from "@/lib/mcp/auth";
import { TOOL_DOCS } from "@/lib/mcp/server";
import { McpSettings } from "@/components/mcp/McpSettings";

export const dynamic = "force-dynamic";

export default function Page() {
  const keys = apiKeys.list().map((k) => ({ ...k, key: mask(k.key) }));
  const allow = (appSettings.get() as unknown as { mcpAllowLocalNoAuth?: boolean }).mcpAllowLocalNoAuth ?? true;
  return (
    <div className="flex-1 overflow-y-auto"><div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold mb-1">MCP · API 키</h1>
      <p className="text-sm text-muted mb-6">Claude Code, Cursor 같은 AI 도구에서 PlanFast 문서를 읽고 수정할 수 있게 MCP 서버를 열어 둡니다.</p>
      <McpSettings initialKeys={keys} initialAllow={allow} tools={TOOL_DOCS} />
    </div></div>
  );
}
