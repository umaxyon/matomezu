// 図のデータの差分（D31。2026-10-15 ユーザー）。Undo / Redo は、ブック全体の写しに戻すのではなく、操作ごとの差分を今の状態に当てる
// （LLM の変更はユーザーの履歴に入らないので、写しに戻すと LLM の変更まで消えるため）。サーバーの LLM の履歴（internal/server/llmdiff.go）と同じ決まり:
// 箱（nodes）・線（edges）・ページ（pages）・消した箱（removed）は id ごと、world とそのほかの最上位の項目は項目ごと、箱の並び順は 1 件にまとめる。
// 最上位の項目の有無と並び（空になった removed が項目ごと無くなる、など）も 1 件にまとめ、戻した・進めた後のデータを前・後と同じ形にする。
// 戻す（undo）ときは、変えた項目を前の値にする（後から LLM が変えていても上書きする）。足した箱を戻すときは、子孫とつながる線ごと消す（後から LLM が
// 中に足した子も消す）。進める（redo）ときは後の値にする。当てる相手が無ければ（もう消えている）その 1 件は飛ばす。DOM に依存しない
//
//   const ops = diffData(before, after);
//   const back = applyChanges(now, ops, "undo");

import type { Diagram } from "./types";

type Obj = Record<string, unknown>;

export interface Change {
  kind: "node" | "edge" | "page" | "removed" | "world" | "top" | "order" | "keys";
  key: string;
  op: "add" | "remove" | "change" | "order";
  fields?: string[];
  before?: Obj;   // change: 変える前の項目（無い項目は前は無かった）
  after?: Obj;    // change: 変えた後の項目
  keys?: [string[], string[]]; // change: 前と後の項目の並び（戻したとき、ファイルの項目の並びもそろえる）
  item?: unknown; // add: 足した物 / remove: 消した物
  at?: number;    // add: 足した後の並びでの位置 / remove: 消す前の並びでの位置（戻すときはその位置に入れる）
  from?: string[]; // order: 前の並び / keys: 前の最上位の項目の並び
  to?: string[];   // order: 後の並び / keys: 後の最上位の項目の並び
}

const COLLECTIONS = [["nodes", "node"], ["edges", "edge"], ["pages", "page"], ["removed", "removed"]] as const;
type Kind = (typeof COLLECTIONS)[number][1];
const SKIP = new Set(["world", "nodes", "edges", "pages", "removed"]);

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function keyOf(kind: Kind, v: unknown, i: number): string {
  if (isObj(v)) {
    if (v.id != null) return String(v.id);
    if (kind === "edge") return `${String(v.from)}>${String(v.to)}`;
  } else if (kind === "edge" && Array.isArray(v) && v.length >= 2) return `${String(v[0])}>${String(v[1])}`;
  return `#${i}`;
}
const listOf = (d: Obj, name: string): unknown[] => (Array.isArray(d[name]) ? (d[name] as unknown[]) : []);

function fieldDiff(a: Obj, b: Obj): { fields: string[]; before: Obj; after: Obj; keys: [string[], string[]] } | null {
  const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !same(a[k], b[k])).sort();
  if (!fields.length) return null;
  const before: Obj = {}, after: Obj = {};
  for (const k of fields) {
    if (k in a) before[k] = clone(a[k]);
    if (k in b) after[k] = clone(b[k]);
  }
  return { fields, before, after, keys: [Object.keys(a), Object.keys(b)] };
}

// a から b への差分
export function diffData(a: Diagram, b: Diagram): Change[] {
  const A = a as unknown as Obj, B = b as unknown as Obj;
  const out: Change[] = [];
  for (const [name, kind] of COLLECTIONS) {
    const la = listOf(A, name), lb = listOf(B, name);
    const ka = la.map((v, i) => keyOf(kind, v, i)), kb = lb.map((v, i) => keyOf(kind, v, i));
    const byA = new Map(ka.map((k, i) => [k, la[i]])), byB = new Map(kb.map((k, i) => [k, lb[i]]));
    const posA = new Map(ka.map((k, i) => [k, i])), posB = new Map(kb.map((k, i) => [k, i]));
    for (const [k, x] of byA) {
      if (!byB.has(k)) { out.push({ kind, key: k, op: "remove", item: clone(x), at: posA.get(k)! }); continue; }
      const y = byB.get(k);
      if (isObj(x) && isObj(y)) {
        const f = fieldDiff(x, y);
        if (f) out.push({ kind, key: k, op: "change", ...f });
      } else if (!same(x, y)) out.push({ kind, key: k, op: "remove", item: clone(x), at: posA.get(k)! }, { kind, key: k, op: "add", item: clone(y), at: posB.get(k)! });
    }
    for (const [k, y] of byB) if (!byA.has(k)) out.push({ kind, key: k, op: "add", item: clone(y), at: posB.get(k)! });
    if (kind === "node") {
      const from = ka.filter(k => byB.has(k)), to = kb.filter(k => byA.has(k));
      if (!same(from, to)) out.push({ kind: "order", key: "nodes", op: "order", from, to });
    }
  }
  const w = fieldDiff(isObj(A.world) ? A.world : {}, isObj(B.world) ? B.world : {});
  if (w) out.push({ kind: "world", key: "", op: "change", ...w });
  const top = (d: Obj) => Object.fromEntries(Object.entries(d).filter(([k]) => !SKIP.has(k)));
  const tf = fieldDiff(top(A), top(B));
  if (tf) out.push({ kind: "top", key: "", op: "change", ...tf });
  if (!same(Object.keys(A), Object.keys(B))) out.push({ kind: "keys", key: "", op: "order", from: Object.keys(A), to: Object.keys(B) });
  return out;
}

// 差分で触った箱の id（足した・消した・変えた箱。線は両端の箱）。ページの設定（world・pages）を変えたかも返す
export function touchedOf(changes: Change[]): { nodes: Set<string>; removed: Map<string, unknown>; pages: Set<string | null>; whole: boolean } {
  const nodes = new Set<string>(), removed = new Map<string, unknown>(), pages = new Set<string | null>();
  let whole = false;
  for (const c of changes) {
    if (c.kind === "node") {
      if (c.op === "remove") removed.set(c.key, c.item);
      else nodes.add(c.key);
    } else if (c.kind === "edge") {
      const e = (c.op === "change" ? { ...c.before, ...c.after } : c.item) as Obj | unknown[] | undefined;
      const ends = Array.isArray(e) ? [e[0], e[1]] : isObj(e) ? [e.from, e.to] : [];
      for (const x of ends) if (x != null) nodes.add(String(x));
      if (c.op === "change") { const [f, t] = c.key.split(">"); if (t != null) { nodes.add(f!); nodes.add(t); } }
    } else if (c.kind === "world") pages.add(null);
    else if (c.kind === "page") pages.add(c.key);
    else if (c.kind === "top") whole = true;
  }
  return { nodes, removed, pages, whole };
}

// data に changes を当てた新しいデータ。dir が undo なら逆を（後ろから）、redo なら前から当てる
export function applyChanges(data: Diagram, changes: Change[], dir: "undo" | "redo"): Diagram {
  const d = clone(data) as unknown as Obj;
  const lists = new Map<Kind, unknown[]>(COLLECTIONS.map(([name, kind]) => [kind, listOf(d, name).slice()]));
  const find = (kind: Kind, key: string) => lists.get(kind)!.findIndex((v, i) => keyOf(kind, v, i) === key);
  const removeNode = (key: string) => {
    // 子孫と、つながる線も消す（2026-10-15 ユーザー: ユーザーの箱に LLM が子を足していても、子ごと消す）
    const nodes = lists.get("node")!;
    const gone = new Set([key]);
    for (let grew = true; grew;) {
      grew = false;
      for (const n of nodes) if (isObj(n) && n.parent != null && !gone.has(String(n.id)) && gone.has(String(n.parent))) { gone.add(String(n.id)); grew = true; }
    }
    lists.set("node", nodes.filter((n, i) => !gone.has(keyOf("node", n, i))));
    lists.set("edge", lists.get("edge")!.filter(e => {
      const ends = Array.isArray(e) ? [e[0], e[1]] : isObj(e) ? [e.from, e.to] : [];
      return !ends.some(x => gone.has(String(x)));
    }));
  };
  // 項目を当て、項目の並びも当てる側にそろえる（並びに無い項目は後ろのまま）
  const setFields = (o: Obj, c: Change, side: Obj | undefined) => {
    for (const f of c.fields ?? []) {
      if (side && f in side) o[f] = clone(side[f]);
      else delete o[f];
    }
    const order = c.keys?.[side === c.before ? 0 : 1];
    if (!order) return;
    const rest = Object.keys(o).filter(k => !order.includes(k));
    const vals = { ...o };
    for (const k of Object.keys(o)) delete o[k];
    for (const k of [...order.filter(k => k in vals), ...rest]) o[k] = vals[k];
  };
  const reorder = (order: string[]) => {
    const rank = new Map(order.map((k, i) => [k, i]));
    const list = lists.get("node")!;
    const slots: number[] = [], picked: unknown[] = [];
    list.forEach((v, i) => { if (rank.has(keyOf("node", v, i))) { slots.push(i); picked.push(v); } });
    picked.sort((x, y) => rank.get(keyOf("node", x, 0))! - rank.get(keyOf("node", y, 0))!);
    slots.forEach((s, j) => { list[s] = picked[j]; });
  };
  const world: Obj = isObj(d.world) ? d.world : {};
  const undo = dir === "undo";
  const adds = (c: Change) => (c.op === "add") !== undo && (c.op === "add" || c.op === "remove"); // redo の add と undo の remove は足す
  // 当てる順: 消す・項目を変える → 足す（元の位置の小さい順。位置がずれないように）→ 並び順
  const seq = undo ? [...changes].reverse() : changes;
  const phased = [
    ...seq.filter(c => c.kind !== "order" && c.kind !== "keys" && !adds(c)),
    ...seq.filter(adds).sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity)),
    ...seq.filter(c => c.kind === "order"),
  ];
  for (const c of phased) {
    if (c.kind === "world") setFields(world, c, undo ? c.before : c.after);
    else if (c.kind === "top") setFields(d, c, undo ? c.before : c.after);
    else if (c.kind === "order") reorder((undo ? c.from : c.to) ?? []);
    else if (c.kind === "keys") continue;
    else {
      const kind = c.kind;
      const adding = adds(c);
      if (c.op === "change") {
        const i = find(kind, c.key);
        const o = i >= 0 ? lists.get(kind)![i] : undefined;
        if (isObj(o)) setFields(o, c, undo ? c.before : c.after);
      } else if (adding) {
        const list = lists.get(kind)!;
        if (find(kind, c.key) < 0) list.splice(Math.min(c.at ?? list.length, list.length), 0, clone(c.item));
      } else if (kind === "node") removeNode(c.key);
      else {
        const i = find(kind, c.key);
        if (i >= 0) lists.get(kind)!.splice(i, 1);
      }
    }
  }
  // 最上位の項目の有無と並び: 差分にあれば当てる側の形にそろえる（空の一覧・空の world は、当てる側に無ければ書かない）。無ければ今の形のまま
  const shape = changes.find(c => c.kind === "keys");
  const want = shape ? (undo ? shape.from : shape.to) ?? null : null;
  const keep = (name: string, empty: boolean) => (want ? want.includes(name) || !empty : name in d || !empty);
  if (keep("world", !Object.keys(world).length)) d.world = world;
  else delete d.world;
  for (const [name, kind] of COLLECTIONS) {
    const list = lists.get(kind)!;
    if (keep(name, !list.length)) d[name] = list;
    else delete d[name];
  }
  if (want) {
    const vals = { ...d };
    for (const k of Object.keys(d)) delete d[k];
    for (const k of [...want.filter(k => k in vals), ...Object.keys(vals).filter(k => !want.includes(k))]) d[k] = vals[k];
  }
  return d as unknown as Diagram;
}
