"use client";
/**
 * 작업 등급별 모델 배치 설정.
 *
 * 기본값은 "최적 배치"(policy.ts DEFAULT_TIER_MODELS)이고, 사용자는 등급마다 모델·노력을 바꿀 수 있다.
 * 어느 작업이 어느 등급인지는 여기서 바꾸지 않는다 — 그건 코드(정책)의 판단이고,
 * 사용자가 조절하는 건 "그 등급에 어떤 모델을 쓸 것인가"다. 이 둘을 섞으면 설정이 금방 엉킨다.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Zap, Brain, Layers, Sparkles, Info } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import {
  AI_TIERS, AI_EFFORTS, DEFAULT_TIER_MODELS, MODEL_CHOICES, TIER_LABEL, TASK_LABEL,
  normalizeTierModels, tasksByTier, type AiTier, type AiEffort, type TierModels,
} from "@/lib/ai/policy";
import type { AiRunRecord } from "@/lib/ai";

const TIER_ICON: Record<AiTier, React.ComponentType<{ size?: number; className?: string }>> = { A: Brain, B: Layers, C: Sparkles, D: Zap };
const EFFORT_LABEL: Record<AiEffort, string> = { low: "낮음", medium: "보통", high: "높음" };

/** 프리셋 — 전체를 한 번에 바꾸는 흔한 선택지 */
const PRESETS: { key: string; label: string; desc: string; tiers: TierModels }[] = [
  { key: "optimal", label: "최적 배치 (기본)", desc: "사고·구조는 강한 모델, 채우기·다듬기는 빠른 모델", tiers: DEFAULT_TIER_MODELS },
  { key: "economy", label: "절약", desc: "구독 한도가 빡빡할 때. 검증만 강하게, 나머지는 한 단계씩 낮춤",
    tiers: { A: { model: "opus", effort: "high" }, B: { model: "sonnet", effort: "medium" }, C: { model: "sonnet", effort: "low" }, D: { model: "haiku", effort: "low" } } },
  { key: "max", label: "최대 품질", desc: "시간·소모 상관없이 전부 강하게. 최종 검토 전 한 번 돌릴 때",
    tiers: { A: { model: "claude-fable-5-1", effort: "high" }, B: { model: "claude-fable-5-1", effort: "medium" }, C: { model: "opus", effort: "medium" }, D: { model: "sonnet", effort: "low" } } },
];

const sameTiers = (a: TierModels, b: TierModels) => AI_TIERS.every((t) => a[t].model === b[t].model && a[t].effort === b[t].effort);

export function TierModelSettings({ initial, onSave }: { initial: unknown; onSave: (tiers: TierModels) => Promise<void> }) {
  const [tiers, setTiers] = useState<TierModels>(() => normalizeTierModels(initial));
  const [runs, setRuns] = useState<AiRunRecord[]>([]);
  const byTier = useMemo(() => tasksByTier(), []);
  const activePreset = PRESETS.find((p) => sameTiers(p.tiers, tiers))?.key ?? null;

  const loadRuns = useCallback(async () => {
    try { setRuns(await api<AiRunRecord[]>("/api/settings/ai-runs")); } catch { /* 실측이 없어도 설정은 동작해야 한다 */ }
  }, []);
  useEffect(() => { loadRuns(); }, [loadRuns]); // eslint-disable-line react-hooks/set-state-in-effect -- initial fetch of run log, not a state sync loop

  /** 등급별 실측 요약 — 최근 기록에서 중앙값. 표본이 적으면 표시하지 않는다(오해 유발). */
  const measured = useMemo(() => {
    const out: Partial<Record<AiTier, { n: number; medianSec: number }>> = {};
    for (const t of AI_TIERS) {
      const ms = runs.filter((r) => r.tier === t).map((r) => r.ms).sort((a, b) => a - b);
      if (ms.length >= 2) out[t] = { n: ms.length, medianSec: Math.round(ms[Math.floor(ms.length / 2)] / 1000) };
    }
    return out;
  }, [runs]);

  async function apply(next: TierModels) { setTiers(next); await onSave(next); }
  function setTier(t: AiTier, patch: Partial<TierModels[AiTier]>) { apply({ ...tiers, [t]: { ...tiers[t], ...patch } }); }

  return (
    <section className="card p-5 space-y-4">
      <div>
        <h2 className="font-medium">작업별 모델 배치</h2>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          기획 작업은 성격이 다릅니다. <b>초기 세팅과 검증(모순·누락)</b>은 머리를 많이 써야 하고, 나머지는 큰 틀 안에서 빠르게 채우고 피드백 받는 게 핵심입니다.
          그래서 작업을 4등급으로 나눠 등급마다 다른 모델을 씁니다. 기본값이 최적 배치이고, 필요하면 등급별로 바꿀 수 있습니다.
        </p>
      </div>

      {/* 프리셋 */}
      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => apply(p.tiers)}
            className={clsx("text-left card p-3 transition-colors", activePreset === p.key ? "border-accent ring-1 ring-accent" : "hover:border-line-strong")}>
            <div className="text-sm font-medium">{p.label}</div>
            <div className="text-[11px] text-muted mt-1 leading-snug">{p.desc}</div>
          </button>
        ))}
      </div>
      {!activePreset && <div className="text-[11px] text-muted flex items-center gap-1"><Info size={11} /> 직접 조정한 배치를 쓰고 있습니다.</div>}

      {/* 등급별 편집 */}
      <div className="divide-y border rounded-lg">
        {AI_TIERS.map((t) => {
          const Icon = TIER_ICON[t];
          const m = measured[t];
          const isDefault = tiers[t].model === DEFAULT_TIER_MODELS[t].model && tiers[t].effort === DEFAULT_TIER_MODELS[t].effort;
          return (
            <div key={t} className="p-3 grid grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-1 items-start">
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="chip !py-0 !text-[11px] bg-accent-soft text-accent border-transparent font-semibold">{t}</span>
                <Icon size={14} className="text-muted" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{TIER_LABEL[t].name}</div>
                <div className="text-[11px] text-muted leading-snug">{TIER_LABEL[t].desc}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {byTier[t].map((task) => <span key={task} className="chip !py-0 !text-[10px] text-muted">{TASK_LABEL[task]}</span>)}
                </div>
                <div className="text-[10px] text-muted mt-1">
                  {m ? <>실측 중앙값 <b className="text-fg">{m.medianSec}초</b> · 최근 {m.n}회</> : <>예상 {TIER_LABEL[t].hint}</>}
                </div>
              </div>
              <label className="text-[11px] text-muted">모델
                <select className="input !py-1 mt-0.5 text-xs w-36" value={tiers[t].model} onChange={(e) => setTier(t, { model: e.target.value })}>
                  {MODEL_CHOICES.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.note}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-muted">노력
                <select className="input !py-1 mt-0.5 text-xs w-20" value={tiers[t].effort} onChange={(e) => setTier(t, { effort: e.target.value as AiEffort })}>
                  {AI_EFFORTS.map((e) => <option key={e} value={e}>{EFFORT_LABEL[e]}</option>)}
                </select>
                {!isDefault && <button className="block text-[10px] underline mt-0.5" onClick={() => setTier(t, DEFAULT_TIER_MODELS[t])}>기본값</button>}
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted">
          Fable·Opus 를 쓰는 등급은 구독 5시간 창 소모가 큽니다. 한도가 빡빡한 날은 &quot;절약&quot;으로 두세요.
        </p>
        <button className="btn btn-sm" disabled={activePreset === "optimal"} onClick={() => apply(DEFAULT_TIER_MODELS)}><RotateCcw size={12} /> 최적 배치로 되돌리기</button>
      </div>
    </section>
  );
}
