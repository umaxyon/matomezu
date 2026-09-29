// ブックの中のページ（docs/TABS-plan.md）。データ（BoxData の並び）だけを見る関数。DOM に依存しない。
// page: true のボックスの中身が 1 枚のページになる。ページは入れ子にしない。それ以外の箱は最初のページ（null）にある

import type { BoxData, Id } from "./types";

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
