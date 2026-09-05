"use client";
/**
 * 스트리밍 중인 매니 답변 본문.
 *
 * 서버는 ~250ms 마다 메시지 행의 content 를 갱신하고 클라이언트는 700ms 마다 폴링하므로,
 * 그대로 그리면 글이 뭉텅이로 튄다. 여기서는 "보여줄 문자열(shown)"을 따로 두고 매 애니메이션
 * 프레임마다 목표 문자열 쪽으로 조금씩 전진시켜 타자 치는 느낌을 만든다.
 *
 * shown 은 마운트 시점의 content 로 시작한다 → 기록에서 불러온 완료 메시지는 타이핑 없이 그대로.
 */
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/manny/Markdown";

type Phase = "read" | "write" | "proposals";
const PHASE_LABEL: Record<Phase, string> = { read: "읽는 중", write: "쓰는 중", proposals: "제안 정리 중" };

/** 프레임당 전진 글자 수. 기본 3자(≈180자/초), 많이 밀렸을 땐 따라잡는다. */
const advance = (remaining: number) => Math.max(3, Math.ceil(remaining / 24));
/** 본문이 이만큼 안 자라면서 스트림은 계속되면 = 모델이 제안 펜스를 쓰는 중 */
const PROPOSAL_HINT_MS = 1500;

export function StreamingReply({ content, streaming }: { content: string; streaming: boolean }) {
  const [shown, setShown] = useState(content);
  const [phase, setPhase] = useState<Phase>(content ? "write" : "read");
  const shownRef = useRef(content);
  const contentRef = useRef(content);
  const streamingRef = useRef(streaming);
  const grewAt = useRef(0);

  useEffect(() => {
    // ref 동기화는 렌더가 아니라 이펙트에서
    contentRef.current = content;
    streamingRef.current = streaming;
    let raf = 0;
    const tick = () => {
      const target = contentRef.current;
      let s = shownRef.current;
      if (!target.startsWith(s)) {
        // 서버가 본문을 다시 쓴 경우(끝 트림 등) 공통 접두사까지만 되감는다
        let i = 0;
        while (i < s.length && i < target.length && s[i] === target[i]) i++;
        s = target.slice(0, i);
        shownRef.current = s;
        setShown(s);
      }
      if (s.length < target.length) {
        s = target.slice(0, s.length + advance(target.length - s.length));
        shownRef.current = s;
        setShown(s);
        grewAt.current = performance.now();
        setPhase("write");
      } else if (!streamingRef.current) {
        return; // 다 따라잡았고 생성도 끝났다 → 루프 정지
      } else if (!target) setPhase("read");
      else if (performance.now() - grewAt.current > PROPOSAL_HINT_MS) setPhase("proposals");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [content, streaming]);

  const catching = shown.length < content.length;
  const busy = streaming || catching;
  return (
    <div>
      {shown ? <Markdown text={shown} /> : null}
      {busy && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block w-[2px] h-3 rounded-full bg-accent animate-pulse" aria-hidden />
          <span>매니가 작성 중</span>
          <span className="opacity-70">· {PHASE_LABEL[catching && streaming ? "write" : phase]}</span>
        </div>
      )}
    </div>
  );
}
