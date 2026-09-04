import type { Flow, FlowNodeType } from "@/lib/types";

const esc = (s: string) => s.replace(/"/g, "#quot;").replace(/\n/g, " ").trim() || " ";
const shape: Record<FlowNodeType, (l: string) => string> = {
  start: (l) => `(("${l}"))`,
  page: (l) => `["${l}"]`,
  data: (l) => `[("${l}")]`,
  branch: (l) => `{"${l}"}`,
  action: (l) => `("${l}")`,
};

/** Mermaid flowchart (LR). Safe to paste into mermaid.live / Notion / GitHub. */
export function flowToMermaid(flow: Flow): string {
  const id = new Map(flow.nodes.map((n, i) => [n.id, `n${i + 1}`]));
  const lines = [`%% ${flow.name}`, "flowchart LR"];
  for (const n of flow.nodes) lines.push(`  ${id.get(n.id)}${shape[n.type]?.(esc(n.label || n.type)) ?? `["${esc(n.label)}"]`}`);
  for (const e of flow.edges) {
    const a = id.get(e.source); const b = id.get(e.target);
    if (!a || !b) continue;
    lines.push(e.label ? `  ${a} -->|"${esc(e.label)}"| ${b}` : `  ${a} --> ${b}`);
  }
  return lines.join("\n") + "\n";
}
