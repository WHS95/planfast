/**
 * Server-Sent Events 응답 도우미 (라우트 핸들러용).
 *
 * "생성 중입니다…" 스피너 대신, 만들어지는 대로 화면에 그리려면 서버가 결과를 조각조각 밀어줘야 한다.
 * 라우트는 `sse(async (send) => { ... })` 로 감싸고, 이벤트가 생길 때마다 `send(event, data)` 를 부른다.
 *
 * 클라이언트는 `readSse()` (src/lib/api.ts) 로 읽는다. 둘의 이벤트 이름·형식은 호출부가 정한다.
 */
export type SseSend = (event: string, data: unknown) => void;

export function sse(run: (send: SseSend, signal: AbortSignal) => Promise<void>): Response {
  const enc = new TextEncoder();
  const ac = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let closed = false;
      const send: SseSend = (event, data) => {
        if (closed) return;
        try { ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { closed = true; }
      };
      // 프록시·브라우저가 연결을 끊지 않게 15초마다 주석 프레임
      const ping = setInterval(() => { if (!closed) { try { ctrl.enqueue(enc.encode(": ping\n\n")); } catch { closed = true; } } }, 15000);
      try {
        await run(send, ac.signal);
      } catch (e) {
        send("error", { message: (e as Error).message ?? "unknown error" });
      } finally {
        clearInterval(ping);
        closed = true;
        try { ctrl.close(); } catch { /* already closed */ }
      }
    },
    cancel() { ac.abort(); },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
