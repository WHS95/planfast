"use client";
import { X } from "lucide-react";
import { useEffect } from "react";
import clsx from "clsx";
export function Dialog({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={clsx("card shadow-xl w-full max-h-[90vh] flex flex-col", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
