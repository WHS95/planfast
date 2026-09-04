"use client";
/**
 * Shared editor context: current project, a `refresh()` broadcaster so panels (e.g. Manny accepting
 * a proposal) can tell the active tab to reload its data, and a way to open a tool panel tab.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/types";
import type { ToolTab } from "./ToolPanel";

interface Ctx {
  project: Project;
  /** increments whenever any panel mutates project data; tabs should refetch on change */
  tick: number;
  refresh: () => void;
  openTool: (t: ToolTab) => void;
  /** currently selected item on the features tab (for @mention / comments) */
  selection: { type: string; id: string; label: string } | null;
  setSelection: (s: Ctx["selection"]) => void;
  /** pending mention pushed from a tab into the Manny composer */
  pendingMention: { type: string; id: string; label: string } | null;
  mention: (m: { type: "prd" | "item" | "flow" | "wireframe"; id: string; label: string }) => void;
  consumeMention: () => void;
}
const C = createContext<Ctx | null>(null);

export function EditorProvider({ project, openTool, children }: { project: Project; openTool: (t: ToolTab) => void; children: React.ReactNode }) {
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const [selection, setSelection] = useState<Ctx["selection"]>(null);
  const [pendingMention, setPending] = useState<Ctx["pendingMention"]>(null);
  const refresh = useCallback(() => { setTick((t) => t + 1); router.refresh(); }, [router]);
  const openRef = useRef(openTool); openRef.current = openTool;
  const mention = useCallback((m: NonNullable<Ctx["pendingMention"]>) => { setPending(m); openRef.current("manny"); }, []);
  const consumeMention = useCallback(() => setPending(null), []);
  const value = useMemo<Ctx>(() => ({ project, tick, refresh, openTool: (t) => openRef.current(t), selection, setSelection, pendingMention, mention, consumeMention }), [project, tick, refresh, selection, pendingMention, mention, consumeMention]);
  // simple polling-free "external change" listener: BroadcastChannel across tabs
  useEffect(() => {
    const bc = new BroadcastChannel(`planfast:${project.id}`);
    bc.onmessage = () => setTick((t) => t + 1);
    return () => bc.close();
  }, [project.id]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
export function useEditor() {
  const c = useContext(C);
  if (!c) throw new Error("useEditor outside EditorProvider");
  return c;
}
/** Notify other browser tabs + local panels that project data changed */
export function broadcastChange(projectId: string) {
  try { new BroadcastChannel(`planfast:${projectId}`).postMessage("change"); } catch { /* ignore */ }
}
