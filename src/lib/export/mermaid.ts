import type { Flow, FlowNode, FlowNodeType } from "@/lib/types";

const esc = (s: string) => s.replace(/"/g, "#quot;").replace(/\n/g, " ").trim() || " ";
const shape: Record<FlowNodeType, (l: string) => string> = {
  start: (l) => `(("${l}"))`,
  page: (l) => `["${l}"]`,
  data: (l) => `[("${l}")]`,
  branch: (l) => `{"${l}"}`,
  action: (l) => `("${l}")`,
};

/**
 * Mermaid flowchart (LR). Safe to paste into mermaid.live / Notion / GitHub.
 * 프레임(스윔레인)이 있으면 프레임마다 `subgraph … end` 로 감싼다.
 * 레인을 넘나드는 연결이 잘못 묶이지 않도록 edge 는 모든 subgraph 뒤에 몰아서 출력한다.
 */
export function flowToMermaid(flow: Flow): string {
  const id = new Map(flow.nodes.map((n, i) => [n.id, `n${i + 1}`]));
  const decl = (n: FlowNode) => `${id.get(n.id)}${shape[n.type]?.(esc(n.label || n.type)) ?? `["${esc(n.label)}"]`}`;
  const lines = [`%% ${flow.name}`, "flowchart LR"];

  const frames = [...(flow.frames ?? [])].sort((a, b) => a.order - b.order);
  const known = new Set(frames.map((f) => f.id));
  frames.forEach((f, i) => {
    const inside = flow.nodes.filter((n) => n.frameId === f.id);
    if (!inside.length) return;
    lines.push(`  subgraph f${i + 1}["${esc(f.label)}"]`, "    direction LR");
    for (const n of inside) lines.push(`    ${decl(n)}`);
    lines.push("  end");
  });
  for (const n of flow.nodes) if (!n.frameId || !known.has(n.frameId)) lines.push(`  ${decl(n)}`);

  for (const e of flow.edges) {
    const a = id.get(e.source); const b = id.get(e.target);
    if (!a || !b) continue;
    lines.push(e.label ? `  ${a} -->|"${esc(e.label)}"| ${b}` : `  ${a} --> ${b}`);
  }
  return lines.join("\n") + "\n";
}
