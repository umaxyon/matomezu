// ブックのデータ（Diagram）を直す関数。DOM に依存しない。
// graph.ts は付け替え・ほかのページの箱の削除・復活・移植を、データ全体を取り出してこれで直し、図を組み立て直す。
// 箱を描いていることに関わる判断（今のページ、落とし先の見せ方、位置の計算）は graph.ts の側で行い、結果だけを渡す

import { t } from "./i18n";
import { subtreeIds } from "./pages";
import { type ClassAttr, type ClassOp, cleanMembers, memberNames } from "./classbox";
import type { BoxData, Diagram, EdgeData, Id, Shape } from "./types";
import { normalizeEdge } from "./validate";
import { DEFAULT_SHAPE } from "./shapes";

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

// 置き場所: 親の箱か、ページの最上位（parent が無ければ page のページ。null は最初のページ）。
// page は最上位の箱にだけ書く（中の箱は親と同じページ。docs/TABS-plan.md）
export interface Place { parent?: Id; page: Id | null }
function setPlace(s: BoxData, at: Place) {
  if (at.parent == null) delete s.parent; else s.parent = at.parent;
  if (at.parent == null && at.page != null) s.page = at.page; else delete s.page;
}

const edgesOf = (data: Diagram) => (data.edges ?? []).map(normalizeEdge);

// 同じ所（同じ親の中か、同じページの最上位）でなくなった線を外し、外した本数を返す
function dropCrossEdges(data: Diagram): number {
  const placeOf = new Map(data.nodes.map(s => [String(s.id), s.parent != null ? `in:${String(s.parent)}` : `page:${key(s.page) ?? ""}`]));
  const all = edgesOf(data);
  const kept = all.filter(e => placeOf.get(String(e.from)) === placeOf.get(String(e.to)));
  data.edges = kept;
  return all.length - kept.length;
}

// id の箱を子孫ごと at（親の箱か、ページの最上位）へ移し、位置を pos にする。
// 同じ親でなくなった線は外し、外した本数を返す
export function moveSubtree(data: Diagram, id: Id, at: Place, pos: Pos): number {
  const src = data.nodes.find(s => String(s.id) === String(id));
  if (!src) throw new Error(t("ボックスがありません: {id}", { id }));
  if (at.parent != null && subtreeIds(data.nodes, id).has(String(at.parent))) throw new Error(t("自分や自分の子孫の中には移せません"));
  setPlace(src, at);
  place(src, pos);
  return dropCrossEdges(data);
}

// id の箱を子孫ごと消す（removed の末尾へ移す）。つながっていた線も消す。消した箱の id と、消した線の本数を返す
export function removeSubtree(data: Diagram, id: Id): { ids: Set<string>; cut: number } {
  if (!data.nodes.some(s => String(s.id) === String(id))) throw new Error(t("ボックスがありません: {id}", { id }));
  const ids = subtreeIds(data.nodes, id);
  data.removed = [...(data.removed ?? []), ...data.nodes.filter(s => ids.has(String(s.id)))];
  data.nodes = data.nodes.filter(s => !ids.has(String(s.id)));
  const all = edgesOf(data);
  data.edges = all.filter(e => !ids.has(String(e.from)) && !ids.has(String(e.to)));
  return { ids, cut: all.length - data.edges.length };
}

// 消した箱 id を、removed の中の子孫ごと at（親の箱か、ページの最上位）に戻し（nodes の末尾へ）、位置を pos にする。線は戻さない
export function restoreSubtree(data: Diagram, id: Id, at: Place, pos: Pos) {
  const list = data.removed ?? [];
  const root = list.find(s => String(s.id) === String(id));
  if (!root) throw new Error(t("消したボックスにありません: {id}", { id }));
  const take = subtreeIds(list, id);
  data.removed = list.filter(s => !take.has(String(s.id)));
  if (!data.removed.length) delete data.removed;
  setPlace(root, at);
  place(root, pos);
  data.nodes.push(...list.filter(s => take.has(String(s.id))));
}

// 写した箱（pages.ts の copySubtree）を at（親の箱か、ページの最上位）にコピーし、位置を pos にする。
// id はこのブックで空いている番号に、線の id も空いている番号に振り直す。新しい根の id と、写した箱と線の数を返す
export function pasteSubtree(
  data: Diagram, copy: { root: string; nodes: BoxData[]; edges: EdgeData[] }, at: Place, pos: Pos,
): { root: string; nodes: number; edges: number } {
  if (!copy.nodes.some(s => String(s.id) === copy.root)) throw new Error(t("写した箱がありません: {id}", { id: copy.root }));
  const used = [...data.nodes, ...(data.removed ?? [])].map(s => Number(s.id)).filter(Number.isFinite);
  let next = Math.max(0, ...used) + 1;
  const ids = new Map(copy.nodes.map(s => [String(s.id), next++]));
  const nodes = copy.nodes.map(s => {
    // このブックの LLM はまだ知らない箱なので、ユーザーが足した印を付ける（docs/ADD-plan.md の 4 章）
    const c: BoxData = { ...JSON.parse(JSON.stringify(s)), id: ids.get(String(s.id))!, userAdded: true };
    if (String(s.id) === copy.root) {
      setPlace(c, at);
      place(c, pos);
    } else {
      c.parent = ids.get(String(s.parent));
      delete c.page;
    }
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

// 新しい箱を at（親の箱か、ページの最上位）に足し、位置を pos にする（画面からの追加。docs/ADD-plan.md）。
// id はこのブックで空いている番号（消した箱の番号も使わない）。before があれば、データの並びでその箱の前に入れる
// （リストの並び順はデータの並び順なので、リストの間への差し込みに使う）。無ければ末尾。新しい箱の id を返す
export function addBox(data: Diagram, fields: Partial<BoxData>, at: Place, pos: Pos, before?: Id): number {
  const used = [...data.nodes, ...(data.removed ?? [])].map(s => Number(s.id)).filter(Number.isFinite);
  const id = Math.max(0, ...used) + 1;
  const s: BoxData = { ...fields, id, userAdded: true };
  setPlace(s, at);
  place(s, pos);
  const idx = before == null ? -1 : data.nodes.findIndex(n => String(n.id) === String(before));
  if (idx < 0) data.nodes.push(s);
  else data.nodes.splice(idx, 0, s);
  return id;
}

// 消した箱 id を、removed の中の子孫ごと完全に削除する（戻せなくする）。消した子孫まで全部がユーザーの足した箱（userAdded）のときだけ。
// LLM から来た箱は「ユーザーが不要と印を付けたもの」として LLM に伝えるために残す（docs/ADD-plan.md の 4 章）。消した箱の数を返す
export function purgeRemoved(data: Diagram, id: Id): number {
  const list = data.removed ?? [];
  if (!list.some(s => String(s.id) === String(id))) throw new Error(t("消したボックスにありません: {id}", { id }));
  const take = subtreeIds(list, id);
  if (!canPurge(list, id)) throw new Error(t("ユーザーが足した箱だけ完全に削除できます"));
  data.removed = list.filter(s => !take.has(String(s.id)));
  if (!data.removed.length) delete data.removed;
  return take.size;
}

// 消した箱 id を完全に削除できるか（removed の中の子孫まで全部がユーザーの足した箱）
export function canPurge(removed: BoxData[], id: Id): boolean {
  const take = subtreeIds(removed, id);
  return removed.filter(s => take.has(String(s.id))).every(s => s.userAdded === true);
}

// クラスの箱にかかわる変更（docs/CLASS-plan.md）。形・キャプション・テーマと、クラスなら abstract・属性・操作。
// renamed は名前を変えた属性・操作（前の名前 → 新しい名前）。線の fromMember / toMember も書き換える
export interface ClassEdit {
  shape: Shape;
  caption?: string;
  theme?: string | null;
  abstract?: boolean;
  attrs?: ClassAttr[];
  ops?: ClassOp[];
  renamed?: Record<string, string>;
}

// id の箱に e を当てる。クラスにするとき子があれば、子孫ごと消す（removed へ移す）。クラスでなくするときは abstract・属性・操作と、
// 線の fromMember / toMember を捨てる。クラスのまま行を消したら、その行につながっていた線も消す。
// 消した子の数と、消した線の数を返す
export function applyClassEdit(data: Diagram, id: Id, e: ClassEdit): { kids: number; cut: number } {
  const s = data.nodes.find(x => String(x.id) === String(id));
  if (!s) throw new Error(t("ボックスがありません: {id}", { id }));
  let kids = 0, cut = 0;
  const isClass = e.shape === "class";
  if (isClass) {
    for (const c of data.nodes.filter(x => key(x.parent) === String(id))) {
      const r = removeSubtree(data, c.id!);
      kids += r.ids.size;
      cut += r.cut;
    }
    // クラスの箱は本文と子の見せ方を持たない。幅は中身で決まる
    for (const k of ["body", "bodyWidth", "bodyLines", "bodyRule", "childView", "overflow", "width", "height"] as const) delete s[k];
  }
  if (e.shape === DEFAULT_SHAPE) delete s.shape; else s.shape = e.shape;
  if (e.caption != null) {
    if (e.caption.trim()) s.caption = e.caption.trim(); else delete s.caption;
  }
  if (e.theme !== undefined) {
    if (e.theme) s.theme = e.theme; else delete s.theme;
  }
  if (isClass) {
    // 渡さなかった項目は今のまま
    if (e.abstract !== undefined) {
      if (e.abstract) s.abstract = true; else delete s.abstract;
    }
    for (const k of ["attrs", "ops"] as const) {
      if (e[k] === undefined) continue;
      const list = cleanMembers<ClassAttr | ClassOp>(e[k]!);
      if (list.length) s[k] = list; else delete s[k];
    }
  } else {
    delete s.abstract;
    delete s.attrs;
    delete s.ops;
  }
  // 線の端の属性・操作。名前を変えたものは書き換え、無くなったものにつながる線は消す（クラスでなくしたなら、クラスそのものにつなぐ）
  const names = new Set(isClass ? memberNames(s) : []);
  const before = (data.edges ?? []).length;
  data.edges = (data.edges ?? []).flatMap(raw => {
    const x = normalizeEdge(raw);
    for (const [end, k] of [[x.from, "fromMember"], [x.to, "toMember"]] as const) {
      if (String(end) !== String(id) || x[k] == null) continue;
      if (!isClass) { delete x[k]; continue; }
      const name = e.renamed?.[x[k]!] ?? x[k]!;
      if (!names.has(name)) return [];
      x[k] = name;
    }
    return [Array.isArray(raw) ? raw : x];
  });
  cut += before - data.edges.length;
  return { kids, cut };
}
