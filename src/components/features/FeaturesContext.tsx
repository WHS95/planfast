"use client";
import { createContext, useContext } from "react";
import type { ItemStore } from "./store";
import type { ProposalAction } from "@/app/api/projects/[id]/items/proposals/route";

export type ViewMode = "tree" | "dir" | "doc";

export interface FeaturesCtx {
  projectId: string;
  store: ItemStore;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  /** search */
  query: string;
  matchIds: string[];
  currentMatchId: string | null;
  /** item id → "1", "1.2", "1.2.3" (tree order) */
  numbers: Map<string, string>;
  /** item id → the accent colour of its requirement root */
  colors: Map<string, string>;
  /** ids of items still awaiting 승인/거절 */
  proposalIds: string[];
  /** approve/reject 매니 proposals; omit `ids` for every proposal in the project */
  resolveProposals: (action: ProposalAction, ids?: string[]) => Promise<void>;
  /** generate children in place (aiProposed). null → top-level requirements */
  aiGenerate: (parentId: string | null) => void;
  /** parent id currently being generated ("" is not used; null + aiBusy means the root run) */
  aiBusy: boolean;
  aiBusyParentId: string | null;
  /** add a child under parent (or a requirement when null) and select it */
  addChild: (parentId: string | null, index?: number) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}

export const FeaturesContext = createContext<FeaturesCtx | null>(null);
export function useFeatures() {
  const c = useContext(FeaturesContext);
  if (!c) throw new Error("useFeatures outside FeaturesEditor");
  return c;
}
