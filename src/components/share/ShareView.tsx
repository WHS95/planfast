"use client";
import { useState } from "react";
import clsx from "clsx";
import { Eye, Sparkles } from "lucide-react";
import type { Flow, Item, Page, Project, Wireframe, WireframePage } from "@/lib/types";
import { SharePrd } from "./SharePrd";
import { ShareFeatures } from "./ShareFeatures";
import { ShareIa } from "./ShareIa";
import { ShareFlows } from "./ShareFlows";
import { ShareWireframes } from "./ShareWireframes";

export type WfWithPages = Wireframe & { pages: WireframePage[] };
const TABS = [
  { key: "prd", label: "PRD" }, { key: "features", label: "기능명세서" }, { key: "ia", label: "정보구조도" }, { key: "flow", label: "유저플로우" }, { key: "wireframe", label: "와이어프레임" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function ShareView({ project, items, pages, flows, wireframes }: { project: Project; items: Item[]; pages: Page[]; flows: Flow[]; wireframes: WfWithPages[] }) {
  const [tab, setTab] = useState<Tab>("prd");
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="h-14 border-b bg-panel flex items-center px-4 gap-3 shrink-0">
        <span className="flex items-center gap-1.5 font-semibold text-sm"><Sparkles size={16} className="text-accent" /> PlanFast</span>
        <div className="w-px h-5 bg-line" />
        <h1 className="font-medium truncate">{project.title}</h1>
        <nav className="flex items-center gap-1 mx-auto">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={clsx("px-3 py-1.5 rounded-md text-sm", tab === t.key ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-fg")}>{t.label}</button>
          ))}
        </nav>
        <span className="chip text-muted"><Eye size={11} /> 읽기 전용</span>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === "prd" && <SharePrd project={project} />}
        {tab === "features" && <ShareFeatures items={items} />}
        {tab === "ia" && <ShareIa pages={pages} items={items} />}
        {tab === "flow" && <ShareFlows flows={flows} />}
        {tab === "wireframe" && <ShareWireframes wireframes={wireframes} />}
      </div>
    </div>
  );
}

export function Scroll({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className="flex-1 overflow-y-auto"><div className={clsx("mx-auto px-6 py-8", wide ? "max-w-5xl" : "max-w-3xl")}>{children}</div></div>;
}
