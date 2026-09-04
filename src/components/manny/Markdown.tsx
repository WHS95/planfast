"use client";
/** Tiny markdown-lite renderer: paragraphs, bullets, numbered lists, headings, **bold**, `code`, ```fences```. No deps. */
import { Fragment } from "react";

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={`${key}-t${i++}`}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={`${key}-b${i++}`}>{tok.slice(2, -2)}</strong>);
    else out.push(<code key={`${key}-c${i++}`} className="rounded bg-black/[.06] dark:bg-white/[.1] px-1 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<Fragment key={`${key}-e`}>{text.slice(last)}</Fragment>);
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0; let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(<pre key={k++} className="rounded-md bg-black/[.05] dark:bg-white/[.08] p-2 text-xs font-mono whitespace-pre-wrap overflow-x-auto">{buf.join("\n")}</pre>);
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const li: React.ReactNode[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        li.push(<li key={li.length}>{inline(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${k}-${li.length}`)}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={k++} className="list-decimal pl-5 space-y-0.5">{li}</ol> : <ul key={k++} className="list-disc pl-5 space-y-0.5">{li}</ul>);
      continue;
    }
    const h = line.match(/^\s*(#{1,4})\s+(.*)$/);
    if (h) { blocks.push(<div key={k++} className="font-semibold mt-1">{inline(h[2], `${k}`)}</div>); i++; continue; }
    if (!line.trim()) { i++; continue; }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !lines[i].trim().startsWith("```") && !/^\s*#{1,4}\s+/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={k++}>{buf.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `${k}-${j}`)}</Fragment>)}</p>);
  }
  return <div className={className ?? "space-y-2 text-sm leading-relaxed"}>{blocks}</div>;
}
