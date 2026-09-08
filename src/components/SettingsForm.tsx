"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw, CircleAlert, CircleCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { AppSettings, AiProvider } from "@/lib/types";
import { Spinner } from "@/components/ui";
import type { ClaudeCliStatus } from "@/app/api/settings/claude-status/route";
import { TierModelSettings } from "@/components/settings/TierModelSettings";
import type { TierModels } from "@/lib/ai/policy";

const INSTALL_CMD: Record<"mac" | "windows", string> = {
  mac: "curl -fsSL https://claude.ai/install.sh | bash",
  windows: "irm https://claude.ai/install.ps1 | iex",
};

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
          {([["claude-cli", "Claude 구독 (추천)", "지금 이 컴퓨터에 로그인된 Claude 계정을 그대로 씁니다. 결제 정보나 API 키를 따로 넣을 필요 없어요."], ["anthropic-api", "Anthropic API 키", "직접 발급받은 API 키로 호출합니다. 사용량만큼 별도로 과금돼요."]] as const).map(([v, t, d]) => (
            <button key={v} onClick={() => save({ aiProvider: v as AiProvider })} className={`text-left card p-3 ${s.aiProvider === v ? "border-accent ring-1 ring-accent" : ""}`}>
              <div className="text-sm font-medium">{t}</div><div className="text-xs text-muted mt-1">{d}</div>
            </button>
          ))}
        </div>
        {s.aiProvider === "claude-cli" && <ClaudeConnectionGuide />}
        {s.aiProvider === "anthropic-api" && (
          <label className="block text-sm"><span className="text-muted">API 키</span><input className="input mt-1 font-mono" type="password" placeholder="sk-ant-…" value={s.anthropicApiKey} onChange={(e) => setS({ ...s, anthropicApiKey: e.target.value })} onBlur={() => save({ anthropicApiKey: s.anthropicApiKey })} /></label>
        )}
        <div className="flex items-center gap-3">
          <button className="btn" onClick={test} disabled={busy}>{busy ? <Spinner /> : null} 실제로 대화해서 확인</button>
          {check && <span className={`text-sm ${check.ok ? "text-ok" : "text-danger"}`}>{check.ok ? "정상 연결" : `실패: ${check.message}`}</span>}
        </div>
      </section>
      <TierModelSettings initial={s.tierModels} onSave={(tiers: TierModels) => save({ tierModels: tiers })} />
    </div>
  );
}

/** "완전 처음 쓰는 사람"도 따라갈 수 있는 Claude 구독 연결 상태 카드 + 설치·로그인 안내. */
function ClaudeConnectionGuide() {
  const [status, setStatus] = useState<ClaudeCliStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"mac" | "windows" | null>(null);

  const load = useCallback(async () => {
    try { setStatus(await api<ClaudeCliStatus>("/api/settings/claude-status")); }
    catch { setStatus({ installed: false, loggedIn: false }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- initial connection-status fetch, not a state sync loop
  function refresh() { setLoading(true); load(); }

  function copy(os: "mac" | "windows") {
    navigator.clipboard.writeText(INSTALL_CMD[os]).then(() => { setCopied(os); setTimeout(() => setCopied(null), 1500); });
  }

  if (loading) return <div className="rounded-lg border p-4 text-sm text-muted flex items-center gap-2"><Spinner /> 연결 상태 확인 중…</div>;

  if (status?.installed && status.loggedIn) {
    return (
      <div className="rounded-lg border border-ok/30 bg-ok-soft p-4 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium text-ok"><CircleCheck size={16} /> Claude 구독으로 연결되어 있어요</div>
        <div className="text-xs text-muted">
          {status.email && <>{status.email} · </>}
          {status.subscriptionType && <>{status.subscriptionType.toUpperCase()} 플랜</>}
        </div>
        <button className="btn btn-sm btn-ghost mt-1" onClick={refresh}><RefreshCw size={12} /> 새로고침</button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-warn/30 bg-warn-soft p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-warn"><CircleAlert size={16} /> 아직 연결되지 않았어요</div>
      <p className="text-xs text-muted leading-relaxed">
        매니는 이 컴퓨터에 설치된 &quot;Claude Code&quot;라는 프로그램을 통해 회원님의 Claude 구독(Pro·Max 등)을 사용해요.
        아래 두 단계만 하면 됩니다. 어렵지 않아요.
      </p>

      <ol className="space-y-3 text-sm">
        <li>
          <div className="font-medium mb-1">1. 터미널을 열고 설치 명령어를 붙여넣으세요</div>
          <div className="text-xs text-muted mb-1.5">Mac은 <span className="font-medium">Spotlight(⌘+Space)</span>에서 &quot;터미널&quot;을 검색해 여세요.</div>
          {(["mac", "windows"] as const).map((os) => (
            <div key={os} className="flex items-center gap-1.5 mb-1">
              <span className="text-[11px] text-muted w-16 shrink-0">{os === "mac" ? "Mac/Linux" : "Windows"}</span>
              <code className="input font-mono text-xs !py-1.5 flex-1 overflow-x-auto whitespace-nowrap">{INSTALL_CMD[os]}</code>
              <button className="btn btn-icon shrink-0" title="복사" onClick={() => copy(os)}>{copied === os ? <Check size={13} /> : <Copy size={13} />}</button>
            </div>
          ))}
        </li>
        <li>
          <div className="font-medium mb-1">2. 설치가 끝나면 터미널에 <code className="kbd">claude</code>만 입력하고 Enter</div>
          <div className="text-xs text-muted">브라우저가 열리면 평소 쓰는 Claude 계정(Pro·Max 등)으로 로그인하세요. 로그인이 끝나면 이 페이지로 돌아와 아래 버튼을 눌러주세요.</div>
        </li>
      </ol>

      <button className="btn btn-sm btn-primary" onClick={refresh}><RefreshCw size={13} /> 연결 상태 다시 확인</button>

      {status?.installed && !status.loggedIn && (
        <p className="text-xs text-muted">설치는 확인됐지만 로그인이 안 되어 있어요. 터미널에 <code className="kbd">claude</code>를 입력해 로그인해주세요.</p>
      )}
    </div>
  );
}
