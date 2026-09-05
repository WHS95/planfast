"use client";
import { createContext, useContext } from "react";

/** 커스텀 노드/엣지가 캔버스 콜백에 접근하기 위한 통로. (React Flow 내부에 렌더되므로 props 로 못 넘김) */
export interface FlowUi {
  renameFrame: (id: string, label: string) => void;
  openFrame: (id: string) => void;
  editEdge: (id: string) => void;
  readOnly: boolean;
}
const noop = () => {};
export const FlowUiContext = createContext<FlowUi>({ renameFrame: noop, openFrame: noop, editEdge: noop, readOnly: true });
export const useFlowUi = () => useContext(FlowUiContext);
