"use client";
/**
 * 공용 모달.
 *
 * - `onClose` 는 "닫힘 애니메이션이 끝난 뒤" 호출된다(부모는 그때 언마운트하면 된다).
 *   덕분에 부모가 `{open && <Dialog/>}` 로 조건부 렌더해도 사라지는 모션이 살아 있다.
 * - 크기: 기본(max-w-lg) · `wide`(max-w-3xl) · `size="xl"`(max-w-5xl).
 *   기존 `wide` 불리언은 그대로 동작한다(= `size="wide"`).
 * - 헤더/푸터는 고정, 본문만 스크롤. Esc 와 배경 클릭으로 닫힌다.
 */
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import clsx from "clsx";

export type DialogSize = "default" | "wide" | "xl";

const MAX_W: Record<DialogSize, string> = {
  default: "max-w-lg",
  wide: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Dialog({
  title,
  onClose,
  children,
  wide,
  size,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** @deprecated `size="wide"` 와 동일 */
  wide?: boolean;
  size?: DialogSize;
  footer?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  // open=false → 나가는 모션 → onExitComplete 에서 부모 onClose
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [close]);

  const max = MAX_W[size ?? (wide ? "wide" : "default")];
  const dur = reduce ? 0 : 0.18;

  return (
    <AnimatePresence onExitComplete={onClose}>
      {open && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: dur, ease: "easeOut" }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={clsx("surface surface-raised w-full max-h-[90vh] flex flex-col overflow-hidden", max)}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: dur, ease: [0.22, 0.8, 0.3, 1] }}
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b bg-panel">
              <h2 className="font-semibold truncate">{title}</h2>
              <button className="btn btn-icon shrink-0" aria-label="닫기" onClick={close}><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 p-5 overflow-y-auto overscroll-contain">{children}</div>
            {footer && <div className="shrink-0 px-5 py-3 border-t bg-panel flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
