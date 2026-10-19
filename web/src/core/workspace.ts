// 見ているもの。画面の見える領域をステージに分け、ステージごとにブックのページを開く。
// 倍率とずらす量はステージごとに持つ。道具箱・キー・タブなどの操作の宛先は、カレントのステージ。
// ステージの並べ方は arrangement が持ち、ステージは自分の置き場所を知らない。
// 操作はデータを書き換えず、新しい値を返す（変わらないステージは同じものを使い回す）
import type { Point } from "./geom";
import { nextNumber } from "./ids";

export interface Stage {
  id: string;
  book: string; // ブックの id
  page: string; // ページの id
  zoom: number;
  pan: Point;   // ずらす量（viewport.ts）
}

export interface Arrangement { direction: "row" } // 横に並べる

export interface Workspace {
  stages: Stage[];
  current: string; // カレントのステージの id
  arrangement: Arrangement;
}

export const MAX_STAGES = 2;
const HOME: Point = { x: 0, y: 0 };

export function newWorkspace(book: string, page: string): Workspace {
  return { stages: [{ id: "s1", book, page, zoom: 1, pan: HOME }], current: "s1", arrangement: { direction: "row" } };
}

export function currentStage(ws: Workspace): Stage {
  const stage = ws.stages.find(s => s.id === ws.current);
  if (!stage) throw new Error(`no current stage: ${ws.current}`);
  return stage;
}

function updateStage(ws: Workspace, id: string, change: (s: Stage) => Stage): Workspace {
  return { ...ws, stages: ws.stages.map(s => (s.id === id ? change(s) : s)) };
}

// カレントのステージの右に、同じページを開いたステージを足す
export function split(ws: Workspace): Workspace {
  if (ws.stages.length >= MAX_STAGES) return ws;
  const cur = currentStage(ws);
  const n = nextNumber("s", ws.stages.map(s => s.id));
  const added: Stage = { id: `s${n}`, book: cur.book, page: cur.page, zoom: 1, pan: HOME };
  const at = ws.stages.indexOf(cur) + 1;
  return { ...ws, stages: [...ws.stages.slice(0, at), added, ...ws.stages.slice(at)] };
}

// カレントのステージだけを残す
export function unsplit(ws: Workspace): Workspace {
  if (ws.stages.length === 1) return ws;
  return { ...ws, stages: [currentStage(ws)] };
}

export function focus(ws: Workspace, id: string): Workspace {
  if (ws.current === id || !ws.stages.some(s => s.id === id)) return ws;
  return { ...ws, current: id };
}

// カレントのステージに、同じブックのページを開く
export function showPage(ws: Workspace, page: string): Workspace {
  return updateStage(ws, ws.current, s => (s.page === page ? s : { ...s, page, pan: HOME }));
}

export function setPan(ws: Workspace, id: string, pan: Point): Workspace {
  return updateStage(ws, id, s => (s.pan.x === pan.x && s.pan.y === pan.y ? s : { ...s, pan }));
}
