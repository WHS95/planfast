"use client";
/** Renders text with case-insensitive highlight of `q`. */
export function Highlight({ text, q, className }: { text: string; q: string; className?: string }) {
  const s = q.trim();
  if (!s || !text) return <span className={className}>{text}</span>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const ls = s.toLowerCase();
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const j = lower.indexOf(ls, i);
    if (j < 0) { parts.push(text.slice(i)); break; }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(<mark key={k++} className="bg-amber-200 text-inherit rounded-sm px-0 dark:bg-amber-500/50">{text.slice(j, j + s.length)}</mark>);
    i = j + s.length;
  }
  return <span className={className}>{parts}</span>;
}
