// ブックの中のページ（docs/TABS-plan.md）。データ（BoxData の並び）だけを見る関数。DOM に依存しない。
// page: true のボックスの中身が 1 枚のページになる。ページは入れ子にしない。それ以外の箱は最初のページ（null）にある

import { normalizeEdge } from "./validate";
import type { BoxData, Diagram, EdgeData, Id, Items, ListItem } from "./types";

const key = (id: Id | undefined) => (id == null ? null : String(id));

function parents(nodes: BoxData[]) {
  return new Map(nodes.map(s => [String(s.id), key(s.parent)]));
}

// 箱が載っているページ（祖先のうちページの箱の id。無ければ null）
export function pageOf(nodes: BoxData[], id: Id): string | null {
  const parent = parents(nodes);
  const byId = new Map(nodes.map(s => [String(s.id), s]));
  for (let p = parent.get(String(id)); p != null; p = parent.get(p) ?? null) {
    if (byId.get(p)?.page === true) return p;
  }
  return null;
}

// ページ（null は最初のページ）に載っている箱の id を、データの並び順で返す。ページの箱そのものは、載っているページの側に入る
export function pageMembers(nodes: BoxData[], page: string | null): string[] {
  return nodes.filter(s => pageOf(nodes, s.id!) === page).map(s => String(s.id));
}

// id の箱と、その子孫の id（ページをまたいで全部）
export function subtreeIds(nodes: BoxData[], id: Id): Set<string> {
  const parent = parents(nodes);
  const out = new Set([String(id)]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [k, p] of parent) {
      if (!out.has(k) && p != null && out.has(p)) {
        out.add(k);
        grew = true;
      }
    }
  }
  return out;
}

// ブックのページの箱（page: true）。データの並び順
export const pageBoxes = (nodes: BoxData[]) => nodes.filter(s => s.page === true);

// データの箱のキャプション（空なら id）
export const captionOfData = (s: BoxData | undefined) =>
  s == null ? "" : s.caption != null && s.caption !== "" ? String(s.caption) : String(s.id);

// ページの名前（最初のページは決まった名前）
export const pageNameOf = (nodes: BoxData[], p: string | null) =>
  p == null ? "最初のページ" : captionOfData(nodes.find(s => String(s.id) === p));

// 一覧の「表示中」とページ（ブック全体）。表示中の箱は、載っているページを添える（ページの箱の直下の子は、親を出さない）。
// current は今描いているページ（ほかのブックの一覧なら undefined で、どのページも current にしない）
export function liveItems(nodes: BoxData[], current: string | null | undefined, defaultColor: string): Pick<Items, "live" | "pages"> {
  const byKey = new Map(nodes.map(s => [String(s.id), s]));
  const live: ListItem[] = nodes.map(s => {
    const p = byKey.get(String(s.parent));
    return {
      id: String(s.id), caption: captionOfData(s),
      color: typeof s.color === "string" && s.color ? s.color : defaultColor,
      parent: p && p.page !== true ? captionOfData(p) : null,
      page: pageOf(nodes, s.id!),
    };
  });
  const pages = [null, ...pageBoxes(nodes).map(s => String(s.id))]
    .map(id => ({ id, caption: pageNameOf(nodes, id), current: id === current }));
  return { live, pages };
}

// id の箱を子孫ごと写す（ページをまたいで全部）。線は、写した箱どうしのものだけ。どちらもデータの並び順
export interface Subtree { root: string; nodes: BoxData[]; edges: EdgeData[] }
export function copySubtree(data: Diagram, id: Id): Subtree {
  const ids = subtreeIds(data.nodes, id);
  const nodes = data.nodes.filter(s => ids.has(String(s.id))).map(s => JSON.parse(JSON.stringify(s)) as BoxData);
  const edges = (data.edges ?? []).map(normalizeEdge)
    .filter(e => ids.has(String(e.from)) && ids.has(String(e.to)))
    .map(e => JSON.parse(JSON.stringify(e)) as EdgeData);
  return { root: String(id), nodes, edges };
}
