"use client";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
export function NewProjectButton() {
  const router = useRouter();
  return (
    <button className="btn btn-primary" onClick={async () => { const p = await api<{ id: string }>("/api/projects", { method: "POST", json: {} }); router.push(`/p/${p.id}/prd`); }}>
      <Plus size={16} /> 새 프로젝트
    </button>
  );
}
