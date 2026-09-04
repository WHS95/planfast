"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Copy, Trash } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { api } from "@/lib/api";
import type { Project, ProjectSettings } from "@/lib/types";

export function ProjectSettingsDialog({ project, onClose }: { project: Project; current?: string; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);
  const [thumbnail, setThumbnail] = useState(project.thumbnail ?? "");
  const [settings, setSettings] = useState<ProjectSettings>(project.settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      await api(`/api/projects/${project.id}`, { method: "PATCH", json: { title: title.trim() || project.title, description, thumbnail: thumbnail.trim() || null, settings } });
      onClose();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  async function act(action: "duplicate" | "trash") {
    if (action === "trash" && !confirm("이 프로젝트를 휴지통으로 이동할까요?")) return;
    try {
      await api(`/api/projects/${project.id}`, { method: "PATCH", json: { action } });
      onClose();
      if (action === "trash") router.push("/projects");
      else router.push("/projects");
    } catch (e) { setError((e as Error).message); }
  }

  function addGlossary() { setSettings((s) => ({ ...s, glossary: [...s.glossary, { term: "", meaning: "" }] })); }
  function updateGlossary(i: number, patch: Partial<{ term: string; meaning: string }>) {
    setSettings((s) => ({ ...s, glossary: s.glossary.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  }
  function removeGlossary(i: number) { setSettings((s) => ({ ...s, glossary: s.glossary.filter((_, j) => j !== i) })); }

  return (
    <Dialog
      title="프로젝트 설정"
      onClose={onClose}
      wide
      footer={<>
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "저장 중…" : "저장"}</button>
      </>}
    >
      <div className="space-y-6">
        {error && <div className="text-xs text-danger">{error}</div>}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">기본 정보</h3>
          <div>
            <label className="text-xs text-muted">제목</label>
            <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted">설명</label>
            <textarea className="input mt-1" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted">썸네일 (이모지 또는 이미지 URL)</label>
            <input className="input mt-1" placeholder="예) 🚀 또는 https://…" value={thumbnail} onChange={(e) => setThumbnail(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.allowAiTraining} onChange={(e) => setSettings((s) => ({ ...s, allowAiTraining: e.target.checked }))} />
            AI 학습에 이 프로젝트 데이터 사용 허용
          </label>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">매니 커스터마이징</h3>
          <div>
            <label className="text-xs text-muted">채팅 말투</label>
            <input className="input mt-1" placeholder="예) 친근하고 간결하게, 존댓말" value={settings.chatTone} onChange={(e) => setSettings((s) => ({ ...s, chatTone: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted">문서 문체</label>
            <input className="input mt-1" placeholder="예) 개조식, 명사형 종결" value={settings.docStyle} onChange={(e) => setSettings((s) => ({ ...s, docStyle: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted">기능 양식</label>
            <textarea className="input mt-1" rows={2} placeholder="기능/상세기능 작성 시 따를 양식이나 규칙" value={settings.featureTemplate} onChange={(e) => setSettings((s) => ({ ...s, featureTemplate: e.target.value }))} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted">용어집</label>
              <button className="btn btn-sm btn-ghost" onClick={addGlossary}><Plus size={12} /> 추가</button>
            </div>
            <div className="space-y-1.5">
              {settings.glossary.map((g, i) => (
                <div key={i} className="flex gap-1.5">
                  <input className="input !py-1 text-sm flex-1" placeholder="용어" value={g.term} onChange={(e) => updateGlossary(i, { term: e.target.value })} />
                  <input className="input !py-1 text-sm flex-[2]" placeholder="의미" value={g.meaning} onChange={(e) => updateGlossary(i, { meaning: e.target.value })} />
                  <button className="btn btn-icon text-muted" onClick={() => removeGlossary(i)}><Trash2 size={13} /></button>
                </div>
              ))}
              {settings.glossary.length === 0 && <div className="text-xs text-muted">등록된 용어가 없습니다.</div>}
            </div>
          </div>
        </section>

        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">프로젝트 관리</h3>
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={() => act("duplicate")}><Copy size={13} /> 복제</button>
            <button className="btn btn-sm text-danger" onClick={() => act("trash")}><Trash size={13} /> 휴지통으로</button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
