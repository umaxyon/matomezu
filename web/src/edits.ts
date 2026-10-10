// ブックのデータ（Diagram）を直す関数。DOM に依存しない。
// graph.ts は付け替え・ほかのページの箱の削除・復活・移植を、データ全体を取り出してこれで直し、図を組み立て直す。
// 箱を描いていることに関わる判断（今のページ、落とし先の見せ方、位置の計算）は graph.ts の側で行い、結果だけを渡す

import { subtreeIds } from "./pages";
import type { BoxData, Diagram, EdgeData, Id } from "./types";
import { normalizeEdge } from "./validate";

// 置く位置（親の左上から）。null は位置を消して自動で並べる
export type Pos = { x: number; y: number } | null;

const key = (id: Id | undefined) => (id == null ? null : String(id));

function place(s: BoxData, pos: Pos) {
  if (pos) {
    s.x = Math.round(pos.x);
    s.y = Math.round(pos.y);
  } else {
    delete s.x;
    delete s.y;
  }
}

function setParentId(s: BoxData, parent: Id | undefined) {
  if (parent == null) delete s.parent;
  else s.parent = parent;
}

const edgesOf = (data: Diagram) => (data.edges ?? []).map(normalizeEdge);

// 同じ親でなくなった線を外し、外した本数を返す
function dropCrossEdges(data: Diagram): number {
  const parentOf = new Map(data.nodes.map(s => [String(s.id), key(s.parent)]));
  const all = edgesOf(data);
  const kept = all.filter(e => parentOf.get(String(e.from)) === parentOf.get(String(e.to)));
  data.edges = kept;
  return all.length - kept.length;
}

// id の箱を子孫ごと parent（undefined は最上位）の子へ移し、位置を pos にする。
// 同じ親でなくなった線は外し、外した本数を返す
export function moveSubtree(data: Diagram, id: Id, parent: Id | undefined, pos: Pos): number {
  const src = data.nodes.find(s => String(s.id) === String(id));
  if (!src) throw new Error(`ボックスがありません: ${id}`);
  if (parent != null && subtreeIds(data.nodes, id).has(String(parent))) throw new Error("自分や自分の子孫の中には移せません");
  setParentId(src, parent);
  place(src, pos);
  return dropCrossEdges(data);
}

// id の箱を子孫ごと消す（removed の末尾へ移す）。つながっていた線も消す。消した箱の id と、消した線の本数を返す
export function removeSubtree(data: Diagram, id: Id): { ids: Set<string>; cut: number } {
  if (!data.nodes.some(s => String(s.id) === String(id))) throw new Error(`ボックスがありません: ${id}`);
  const ids = subtreeIds(data.nodes, id);
  data.removed = [...(data.removed ?? []), ...data.nodes.filter(s => ids.has(String(s.id)))];
  data.nodes = data.nodes.filter(s => !ids.has(String(s.id)));
  const all = edgesOf(data);
  data.edges = all.filter(e => !ids.has(String(e.from)) && !ids.has(String(e.to)));
  return { ids, cut: all.length - data.edges.length };
}

// 消した箱 id を、removed の中の子孫ごと parent（undefined は最上位）の子に戻し（nodes の末尾へ）、位置を pos にする。線は戻さない
export function restoreSubtree(data: Diagram, id: Id, parent: Id | undefined, pos: Pos) {
  const list = data.removed ?? [];
  const root = list.find(s => String(s.id) === String(id));
  if (!root) throw new Error(`消したボックスにありません: ${id}`);
  const take = subtreeIds(list, id);
  data.removed = list.filter(s => !take.has(String(s.id)));
  if (!data.removed.length) delete data.removed;
  setParentId(root, parent);
  place(root, pos);
  data.nodes.push(...list.filter(s => take.has(String(s.id))));
}

// 写した箱（pages.ts の copySubtree）を parent（undefined は最上位）の子にコピーし、位置を pos にする。
// id はこのブックで空いている番号に、線の id も空いている番号に振り直す。stripPages なら page と world を外す（ページの中へ写すとき）。
// 新しい根の id と、写した箱と線の数を返す
export function pasteSubtree(
  data: Diagram, copy: { root: string; nodes: BoxData[]; edges: EdgeData[] },
  parent: Id | undefined, pos: Pos, stripPages: boolean,
): { root: string; nodes: number; edges: number } {
  if (!copy.nodes.some(s => String(s.id) === copy.root)) throw new Error(`写した箱がありません: ${copy.root}`);
  const used = [...data.nodes, ...(data.removed ?? [])].map(s => Number(s.id)).filter(Number.isFinite);
  let next = Math.max(0, ...used) + 1;
  const ids = new Map(copy.nodes.map(s => [String(s.id), next++]));
  const nodes = copy.nodes.map(s => {
    const c: BoxData = { ...JSON.parse(JSON.stringify(s)), id: ids.get(String(s.id))! };
    if (String(s.id) === copy.root) {
      setParentId(c, parent);
      place(c, pos);
    } else {
      c.parent = ids.get(String(s.parent));
    }
    if (stripPages) { delete c.page; delete c.world; }
    return c;
  });
  const usedEdges = new Set(edgesOf(data).map(e => String(e.id)));
  let seq = 1;
  const edges = copy.edges.map(e => {
    while (usedEdges.has("e" + seq)) seq++;
    usedEdges.add("e" + seq);
    return { ...e, id: "e" + seq, from: ids.get(String(e.from))!, to: ids.get(String(e.to))! };
  });
  data.nodes.push(...nodes);
  data.edges = [...edgesOf(data), ...edges];
  return { root: String(ids.get(copy.root)), nodes: nodes.length, edges: edges.length };
}

// 新しい箱を parent（undefined は最上位）の子として足し、位置を pos にする（画面からの追加。docs/ADD-plan.md）。
// id はこのブックで空いている番号（消した箱の番号も使わない）。before があれば、データの並びでその箱の前に入れる
// （リストの並び順はデータの並び順なので、リストの間への差し込みに使う）。無ければ末尾。新しい箱の id を返す
export function addBox(data: Diagram, fields: Partial<BoxData>, parent: Id | undefined, pos: Pos, before?: Id): number {
  const used = [...data.nodes, ...(data.removed ?? [])].map(s => Number(s.id)).filter(Number.isFinite);
  const id = Math.max(0, ...used) + 1;
  const s: BoxData = { ...fields, id };
  setParentId(s, parent);
  place(s, pos);
  const at = before == null ? -1 : data.nodes.findIndex(n => String(n.id) === String(before));
  if (at < 0) data.nodes.push(s);
  else data.nodes.splice(at, 0, s);
  return id;
}
