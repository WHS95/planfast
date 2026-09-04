/** MCP auth helpers: Bearer pf_sk_ keys, or unauthenticated loopback when the app setting allows. */
import { apiKeys, appSettings } from "@/lib/repo";

export function mask(key: string) { return key.slice(0, 6) + "••••" + key.slice(-4); }

export function allowLocalNoAuth(): boolean {
  return (appSettings.get() as unknown as { mcpAllowLocalNoAuth?: boolean }).mcpAllowLocalNoAuth ?? true;
}

function isLoopbackHost(host: string | null) {
  if (!host) return false;
  const h = host.replace(/^\[/, "").replace(/\]?:\d+$/, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
}

/** Returns null when authorized, otherwise an error message. */
export function authorize(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(pf_sk_[A-Za-z0-9]+)$/i.exec(auth.trim());
  if (m) return apiKeys.verify(m[1]) ? null : "잘못된 API 키입니다";
  if (allowLocalNoAuth() && isLoopbackHost(req.headers.get("host"))) return null;
  return auth ? "Authorization 헤더 형식은 'Bearer pf_sk_…' 입니다" : "API 키가 필요합니다 (Authorization: Bearer pf_sk_…)";
}
