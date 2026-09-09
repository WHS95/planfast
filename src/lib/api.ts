"use client";
/** Tiny fetch helper for client components. Throws on non-2xx with server message. */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Debounced autosave hook helper */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms = 500) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/**
 * SSE 응답을 읽어 이벤트마다 콜백을 부른다. 응답이 끝나면 resolve.
 * 서버 쪽 `sse()` (src/lib/sse.ts) 와 짝.
 */
export async function readSse(
  url: string,
  init: RequestInit & { json?: unknown },
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { Accept: "text/event-stream", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok || !res.body) {
    let msg = res.statusText;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const dispatch = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let data: unknown = dataLines.join("\n");
    try { data = JSON.parse(data as string); } catch { /* 문자열 그대로 */ }
    onEvent(event, data);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i = buf.indexOf("\n\n");
    while (i >= 0) { dispatch(buf.slice(0, i)); buf = buf.slice(i + 2); i = buf.indexOf("\n\n"); }
  }
  if (buf.trim()) dispatch(buf);
}
