/**
 * 점진적 JSON 파서 (SAX 방식).
 *
 * 모델이 JSON 을 한 글자씩 흘려보내는 동안 "완성되기 전"에 값을 꺼내 쓰기 위한 도구.
 * 예를 들어 `{"requirements":[{"title":"초대 링크 발급", ...` 까지만 와도
 *   value  ["requirements", 0, "title"] = "초대 링크 발급"
 * 이벤트가 바로 나오므로, 그 순간 화면에 노드를 그릴 수 있다. 60초 뒤에 한꺼번에 나타나는 대신
 * 사람이 쓰듯이 항목이 하나씩 생겨나게 만드는 기반이다.
 *
 * - 청크 경계를 넘는 문자열·숫자·리터럴을 안전하게 처리한다(부족하면 다음 feed 까지 기다림).
 * - JSON 앞의 산문·코드펜스는 무시하고 첫 `{`/`[` 부터 읽는다.
 * - 잘못된 문법을 만나면 예외 대신 그 지점에서 멈춘다(부분 결과라도 살린다).
 */

export type JsonPath = (string | number)[];
export type JsonScalar = string | number | boolean | null;
export type JsonEvent =
  | { type: "open"; path: JsonPath; kind: "object" | "array" }
  | { type: "close"; path: JsonPath; kind: "object" | "array" }
  | { type: "value"; path: JsonPath; value: JsonScalar };

interface Frame {
  kind: "object" | "array";
  path: JsonPath;
  expect: "key" | "colon" | "value" | "commaOrEnd";
  key: string | null;
  index: number;
}

const WS = new Set([" ", "\n", "\r", "\t"]);
const NUM = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;

export class JsonStreamParser {
  private buf = "";
  private stack: Frame[] = [];
  private started = false;
  private done = false;

  /** 새 청크를 넣고, 이번에 새로 확정된 이벤트를 돌려준다. */
  feed(chunk: string): JsonEvent[] {
    if (this.done) return [];
    this.buf += chunk;
    const out: JsonEvent[] = [];
    let i = 0;
    const n = () => this.buf.length;

    // JSON 시작 전 산문 건너뛰기
    if (!this.started) {
      const a = this.buf.indexOf("{"), b = this.buf.indexOf("[");
      const s = a < 0 ? b : b < 0 ? a : Math.min(a, b);
      if (s < 0) { this.buf = this.buf.slice(-1); return out; } // 아무것도 못 찾음: 버퍼 비움
      i = s;
      this.started = true;
    }

    while (i < n()) {
      const ch = this.buf[i];
      if (WS.has(ch)) { i++; continue; }
      const top = this.stack[this.stack.length - 1];

      // 최상위 값 시작
      if (!top) {
        if (ch === "{" || ch === "[") { this.push(ch === "{" ? "object" : "array", [], out); i++; continue; }
        this.done = true; break; // 최상위 값이 끝난 뒤의 잡문
      }

      if (top.kind === "object") {
        if (top.expect === "key") {
          if (ch === "}") { this.pop(out); i++; continue; }
          if (ch !== '"') { this.done = true; break; }
          const r = this.readString(i);
          if (!r) break; // 문자열이 아직 안 끝남
          top.key = r.value; top.expect = "colon"; i = r.end; continue;
        }
        if (top.expect === "colon") {
          if (ch !== ":") { this.done = true; break; }
          top.expect = "value"; i++; continue;
        }
        if (top.expect === "commaOrEnd") {
          if (ch === ",") { top.expect = "key"; top.key = null; i++; continue; }
          if (ch === "}") { this.pop(out); i++; continue; }
          this.done = true; break;
        }
      } else {
        if (top.expect === "commaOrEnd") {
          if (ch === ",") { top.index++; top.expect = "value"; i++; continue; }
          if (ch === "]") { this.pop(out); i++; continue; }
          this.done = true; break;
        }
        if (top.expect === "value" && ch === "]" && top.index === 0) { this.pop(out); i++; continue; } // 빈 배열
      }

      // expect === "value"
      const path = top.kind === "object" ? [...top.path, top.key!] : [...top.path, top.index];
      if (ch === "{" || ch === "[") { this.push(ch === "{" ? "object" : "array", path, out); top.expect = "commaOrEnd"; i++; continue; }
      if (ch === '"') {
        const r = this.readString(i);
        if (!r) break;
        out.push({ type: "value", path, value: r.value }); top.expect = "commaOrEnd"; i = r.end; continue;
      }
      if (ch === "t" || ch === "f" || ch === "n") {
        const word = ch === "t" ? "true" : ch === "f" ? "false" : "null";
        if (n() - i < word.length) break; // 리터럴이 아직 다 안 옴
        if (this.buf.slice(i, i + word.length) !== word) { this.done = true; break; }
        out.push({ type: "value", path, value: ch === "t" ? true : ch === "f" ? false : null });
        top.expect = "commaOrEnd"; i += word.length; continue;
      }
      if (ch === "-" || (ch >= "0" && ch <= "9")) {
        const m = NUM.exec(this.buf.slice(i));
        // `-` 만 도착한 상태는 아직 숫자가 시작되는 중이다. 깨진 것으로 보지 말고 기다린다.
        if (!m) { if (this.buf.slice(i) === "-") break; this.done = true; break; }
        // 숫자는 "다음 글자가 숫자를 이어갈 수 없을 때"만 확정한다.
        // 버퍼가 `3.` 에서 끊기면 정규식은 `3` 만 잡는데, 여기서 확정하면 3.5 가 3 이 된다(실제로 겪음).
        const after = this.buf[i + m[0].length];
        if (after === undefined || /[0-9.eE+-]/.test(after)) break;
        out.push({ type: "value", path, value: Number(m[0]) }); top.expect = "commaOrEnd"; i += m[0].length; continue;
      }
      this.done = true; break;
    }

    this.buf = this.buf.slice(i);
    return out;
  }

  /** 지금까지 열린 깊이(디버그·진행 표시용) */
  get depth() { return this.stack.length; }
  get finished() { return this.done || (this.started && this.stack.length === 0); }

  private push(kind: "object" | "array", path: JsonPath, out: JsonEvent[]) {
    this.stack.push({ kind, path, expect: kind === "object" ? "key" : "value", key: null, index: 0 });
    out.push({ type: "open", path, kind });
  }
  private pop(out: JsonEvent[]) {
    const f = this.stack.pop()!;
    out.push({ type: "close", path: f.path, kind: f.kind });
    if (!this.stack.length) this.done = true;
  }

  /** i 는 여는 따옴표 위치. 닫는 따옴표까지 있으면 {value, end} 를, 아니면 null. */
  private readString(i: number): { value: string; end: number } | null {
    let j = i + 1;
    let s = "";
    const b = this.buf;
    while (j < b.length) {
      const c = b[j];
      if (c === '"') return { value: s, end: j + 1 };
      if (c === "\\") {
        if (j + 1 >= b.length) return null;
        const e = b[j + 1];
        if (e === "u") {
          if (j + 6 > b.length) return null;
          s += String.fromCharCode(parseInt(b.slice(j + 2, j + 6), 16)); j += 6; continue;
        }
        s += e === "n" ? "\n" : e === "t" ? "\t" : e === "r" ? "\r" : e === "b" ? "\b" : e === "f" ? "\f" : e; j += 2; continue;
      }
      s += c; j++;
    }
    return null;
  }
}

/**
 * 경로 패턴 매칭 도우미. `["requirements", "*", "features", "*", "title"]` 처럼 `*` 로 배열 인덱스를 받는다.
 * 매치되면 `*` 자리의 실제 인덱스 배열을 돌려준다.
 */
export function matchPath(path: JsonPath, pattern: (string | "*")[]): number[] | null {
  if (path.length !== pattern.length) return null;
  const idx: number[] = [];
  for (let i = 0; i < path.length; i++) {
    if (pattern[i] === "*") { if (typeof path[i] !== "number") return null; idx.push(path[i] as number); }
    else if (path[i] !== pattern[i]) return null;
  }
  return idx;
}

/**
 * 이벤트를 "완성된 객체" 단위로 다시 모아주는 도우미.
 * 스트리밍 중엔 value 이벤트로 즉시 반응하고, 객체가 닫힐 때는 전체 값을 받아 검증·저장하는 식으로 같이 쓴다.
 */
export class JsonAssembler {
  private root: unknown = undefined;
  private refs = new Map<string, unknown>();
  apply(ev: JsonEvent) {
    const key = JSON.stringify(ev.path);
    if (ev.type === "open") {
      const v = ev.kind === "object" ? {} : [];
      this.set(ev.path, v);
      this.refs.set(key, v);
    } else if (ev.type === "value") {
      this.set(ev.path, ev.value);
    }
  }
  /** 경로의 현재 값(부분일 수 있음) */
  get(path: JsonPath): unknown {
    let cur: unknown = this.root;
    for (const p of path) {
      if (cur === null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string | number, unknown>)[p];
    }
    return cur;
  }
  get value() { return this.root; }
  private set(path: JsonPath, v: unknown) {
    if (!path.length) { this.root = v; return; }
    const parent = this.get(path.slice(0, -1)) as Record<string | number, unknown> | undefined;
    if (parent && typeof parent === "object") parent[path[path.length - 1]] = v;
  }
}
