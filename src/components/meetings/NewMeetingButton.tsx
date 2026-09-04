"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Meeting } from "@/lib/types";

export function NewMeetingButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const m = await api<Meeting>("/api/meetings", { method: "POST", json: { title: `회의록 ${new Date().toLocaleDateString("ko-KR")}` } });
      router.push(`/meetings/${m.id}`);
    } finally { setBusy(false); }
  }
  return (
    <button className="btn btn-primary" disabled={busy} onClick={create}><Plus size={14} /> 회의록 작성</button>
  );
}
