"use client";
/**
 * 브라우저 기본 `confirm()/alert()/prompt()` 를 대체하는 앱 모달.
 *
 * 기본 대화상자는 OS 창이라 디자인 시스템 밖에 있고("localhost:3456 내용:" 같은 문구가 그대로 노출),
 * 다크모드·폰트·버튼 스타일이 전부 따로 논다. 그래서 같은 사용법(`await confirm(...)`)을 유지하면서
 * 렌더만 공용 `Dialog` 로 바꾼다.
 *
 * 사용:
 *   const { confirm, alert, prompt } = useDialog();
 *   if (!(await confirm({ message: "삭제할까요?", danger: true }))) return;
 *
 * 구조체 대신 문자열만 넘겨도 된다: `await confirm("삭제할까요?")`
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "./Dialog";

export interface ConfirmOptions {
  title?: string;
  message: React.ReactNode;
  /** 확인 버튼 문구 (기본: 확인) */
  confirmLabel?: string;
  cancelLabel?: string;
  /** 되돌릴 수 없는 동작이면 true — 확인 버튼이 빨간색이 되고 경고 아이콘이 붙는다 */
  danger?: boolean;
}
export interface PromptOptions extends Omit<ConfirmOptions, "danger"> {
  defaultValue?: string;
  placeholder?: string;
}

type Ask =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "alert"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

interface DialogApi {
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  alert: (opts: ConfirmOptions | string) => Promise<void>;
  prompt: (opts: PromptOptions | string) => Promise<string | null>;
}

const Ctx = createContext<DialogApi | null>(null);

const asOpts = <T extends { message: React.ReactNode }>(o: T | string): T =>
  (typeof o === "string" ? ({ message: o } as T) : o);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [value, setValue] = useState("");

  const api = useMemo<DialogApi>(() => ({
    confirm: (o) => new Promise<boolean>((resolve) => setAsk({ kind: "confirm", opts: asOpts(o), resolve })),
    alert: (o) => new Promise<void>((resolve) => setAsk({ kind: "alert", opts: asOpts(o), resolve: () => resolve() })),
    prompt: (o) => new Promise<string | null>((resolve) => {
      const opts = asOpts(o) as PromptOptions;
      setValue(opts.defaultValue ?? "");
      setAsk({ kind: "prompt", opts, resolve });
    }),
  }), []);

  // 닫기 = 취소. Esc·배경 클릭·X 버튼 모두 여기로 온다(브라우저 confirm 의 "취소"와 같은 의미).
  const close = useCallback((result: boolean | string | null) => {
    setAsk((cur) => {
      if (!cur) return null;
      if (cur.kind === "prompt") cur.resolve(typeof result === "string" ? result : null);
      else cur.resolve(result === true);
      return null;
    });
  }, []);

  const danger = ask?.kind === "confirm" && ask.opts.danger;
  const title = ask?.opts.title ?? (ask?.kind === "alert" ? "알림" : ask?.kind === "prompt" ? "입력" : "확인");

  return (
    <Ctx.Provider value={api}>
      {children}
      {ask && (
        <Dialog
          title={title}
          onClose={() => close(null)}
          footer={
            <>
              {ask.kind !== "alert" && (
                <button className="btn" onClick={() => close(null)}>{ask.opts.cancelLabel ?? "취소"}</button>
              )}
              <button
                className={danger ? "btn btn-danger" : "btn btn-primary"}
                autoFocus={ask.kind !== "prompt"}
                onClick={() => close(ask.kind === "prompt" ? value : true)}
              >
                {ask.opts.confirmLabel ?? "확인"}
              </button>
            </>
          }
        >
          <div className="flex gap-3">
            {danger && <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1 space-y-3">
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{ask.opts.message}</div>
              {ask.kind === "prompt" && (
                <input
                  className="input" autoFocus value={value} placeholder={(ask.opts as PromptOptions).placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); close(value); } }}
                />
              )}
            </div>
          </div>
        </Dialog>
      )}
    </Ctx.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDialog must be used inside <DialogProvider>");
  return ctx;
}
