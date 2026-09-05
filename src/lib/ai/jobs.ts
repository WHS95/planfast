/**
 * 아주 작은 인프로세스 잡 러너 (server only).
 *
 * 매니 응답 생성은 30초~3분 걸리므로 HTTP 요청 안에서 기다리지 않는다. 라우트는
 * status="streaming" 인 assistant 메시지 행을 먼저 만들고 여기에 잡을 던진 뒤 즉시 응답한다.
 * 잡은 클라이언트 접속이 끊겨도 계속 돌고, 어떤 경우에도 메시지 행을 done/error 로 마감한다.
 *
 * 유일하게 놓치는 경우는 개발 서버 재시작(프로세스 종료)이다. 그때는 행이 "streaming" 으로
 * 남는데, GET 에서 `reapStale()` 이 10분 넘은 유령 스트리밍을 error 로 정리한다.
 */
import { chats } from "@/lib/repo";
import { runMannyStream, type StreamRunInput } from "@/lib/ai/manny";
import type { ChatMessage } from "@/lib/types";

/** 이 프로세스에서 돌고 있는 잡 (messageId → promise) */
const running = new Map<string, Promise<void>>();

/** 이보다 오래된 "streaming" 행은 서버 재시작으로 죽은 것으로 본다 */
export const STALE_MS = 10 * 60 * 1000;
const STALE_NOTE = "서버가 재시작되어 응답이 중단됐어요. 다시 시도해 주세요.";

/**
 * 백그라운드로 생성을 시작한다. **await 하지 말 것** — 라우트는 바로 응답해야 한다.
 * 같은 메시지로 두 번 호출되면 두 번째는 무시한다.
 */
export function startChatJob(input: StreamRunInput): void {
  const id = input.assistantMessageId;
  if (running.has(id)) return;
  const p = (async () => {
    try {
      await runMannyStream(input);
    } catch (e) {
      // runMannyStream 이 자체적으로 error 마감하지만, 그 마감마저 실패한 경우의 최후 방어선
      try {
        chats.updateMessage(id, { content: `응답 생성이 중단됐어요.\n\n오류: ${(e as Error).message?.slice(0, 300) ?? "unknown"}`, proposals: [], status: "error" });
      } catch { /* DB 까지 죽었으면 할 수 있는 게 없다 */ }
    } finally {
      running.delete(id);
    }
  })();
  running.set(id, p);
}

/** 이 프로세스에서 해당 메시지의 잡이 살아 있는지 */
export function isJobRunning(messageId: string): boolean {
  return running.has(messageId);
}

/** 진행 중인 잡 수 (디버그/헬스체크용) */
export function runningJobCount(): number {
  return running.size;
}

/**
 * GET 경로에서 부르는 유령 정리. 이 프로세스에 잡이 없고 10분 넘게 "streaming" 인 메시지를
 * error 로 마감한 뒤, 정리된 목록을 돌려준다. (HMR 로 이 모듈이 다시 평가되면 `running` 이
 * 비므로, 살아 있는 잡을 잘못 죽이지 않도록 시간 조건을 함께 본다.)
 */
export function reapStale(messages: ChatMessage[]): ChatMessage[] {
  const cutoff = Date.now() - STALE_MS;
  return messages.map((m) => {
    if (m.status !== "streaming") return m;
    if (isJobRunning(m.id)) return m;
    const started = Date.parse(m.createdAt);
    if (Number.isFinite(started) && started > cutoff) return m;
    const content = m.content.trim() ? `${m.content.trim()}\n\n${STALE_NOTE}` : STALE_NOTE;
    return chats.updateMessage(m.id, { content, status: "error" }) ?? { ...m, content, status: "error" as const };
  });
}
