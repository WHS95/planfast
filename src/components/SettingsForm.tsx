"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { AppSettings, AiProvider } from "@/lib/types";
import { Spinner } from "@/components/ui";

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(patch: Partial<AppSettings>) { const n = { ...s, ...patch }; setS(n); await api("/api/settings", { method: "PATCH", json: patch }); router.refresh(); }
  async function test() { setBusy(true); setCheck(null); try { setCheck(await api("/api/settings", { method: "POST", json: { provider: s.aiProvider } })); } finally { setBusy(false); } }
  return (
    <div className="space-y-6">
      <section className="card p-5 space-y-4">
        <h2 className="font-medium">프로필</h2>
        <label className="block text-sm"><span className="text-muted">표시 이름</span><input className="input mt-1" value={s.displayName} onChange={(e) => setS({ ...s, displayName: e.target.value })} onBlur={() => save({ displayName: s.displayName })} /></label>
        <label className="block text-sm"><span className="text-muted">테마</span>
          <select className="input mt-1" value={s.theme} onChange={(e) => save({ theme: e.target.value as AppSettings["theme"] })}>
            <option value="system">시스템</option><option value="light">라이트</option><option value="dark">다크</option>
          </select></label>
      </section>
      <section className="card p-5 space-y-4">
        <h2 className="font-medium">AI (매니)</h2>
        <div className="grid grid-cols-2 gap-2">
          {([["claude-cli", "Claude 구독 (Claude Code CLI)", "이 Mac에 로그인된 claude 명령을 사용합니다. API 키 불필요. 개인 사용 전용."], ["anthropic-api", "Anthropic API 키", "ANTHROPIC_API_KEY 또는 아래 키로 직접 호출합니다."]] as const).map(([v, t, d]) => (
            <button key={v} onClick={() => save({ aiProvider: v as AiProvider })} className={`text-left card p-3 ${s.aiProvider === v ? "border-accent ring-1 ring-accent" : ""}`}>
              <div className="text-sm font-medium">{t}</div><div className="text-xs text-muted mt-1">{d}</div>
            </button>
          ))}
        </div>
        {s.aiProvider === "anthropic-api" && (
          <label className="block text-sm"><span className="text-muted">API 키</span><input className="input mt-1 font-mono" type="password" placeholder="sk-ant-…" value={s.anthropicApiKey} onChange={(e) => setS({ ...s, anthropicApiKey: e.target.value })} onBlur={() => save({ anthropicApiKey: s.anthropicApiKey })} /></label>
        )}
        <label className="block text-sm"><span className="text-muted">모델</span>
          <select className="input mt-1" value={s.model} onChange={(e) => save({ model: e.target.value })}>
            <option value="sonnet">Sonnet (기본 · 빠름)</option><option value="opus">Opus (고급 · 느림)</option><option value="haiku">Haiku (초경량)</option>
          </select></label>
        <div className="flex items-center gap-3">
          <button className="btn" onClick={test} disabled={busy}>{busy ? <Spinner /> : null} 연결 테스트</button>
          {check && <span className={`text-sm ${check.ok ? "text-ok" : "text-danger"}`}>{check.ok ? "정상 연결" : `실패: ${check.message}`}</span>}
        </div>
      </section>
    </div>
  );
}
