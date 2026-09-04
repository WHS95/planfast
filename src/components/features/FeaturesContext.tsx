"use client";
import { createContext, useContext } from "react";
import type { ItemStore } from "./store";

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
  /** open AI generation for children of `parentId` (null → top-level requirements) */
  aiGenerate: (parentId: string | null) => void;
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
