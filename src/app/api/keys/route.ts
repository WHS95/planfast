import { handler, ok, bad } from "@/lib/http";
import { apiKeys, appSettings } from "@/lib/repo";
import { mask } from "@/lib/mcp/auth";

/** GET → { keys: masked ApiKey[], allowLocalNoAuth } */
export const GET = handler(async () => ok({
  keys: apiKeys.list().map((k) => ({ ...k, key: mask(k.key) })),
  allowLocalNoAuth: (appSettings.get() as unknown as { mcpAllowLocalNoAuth?: boolean }).mcpAllowLocalNoAuth ?? true,
}));

/** POST { name } → ApiKey (plain key returned ONLY here) */
export const POST = handler(async (req) => {
  const b = (await req.json().catch(() => ({}))) as { name?: string; allowLocalNoAuth?: boolean };
  if (typeof b.allowLocalNoAuth === "boolean") {
    appSettings.set({ mcpAllowLocalNoAuth: b.allowLocalNoAuth } as never);
    return ok({ allowLocalNoAuth: b.allowLocalNoAuth });
  }
  const name = b.name?.trim();
  if (!name) return bad("키 이름을 입력하세요");
  return ok(apiKeys.create(name), { status: 201 });
});
