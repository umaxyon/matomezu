// ブックの中のページ（docs/TABS-plan.md）。データ（BoxData の並び）だけを見る関数。DOM に依存しない。
// page: true のボックスの中身が 1 枚のページになる。ページは入れ子にしない。それ以外の箱は最初のページ（null）にある

import { keyOf } from "./dom";
import { t } from "./i18n";
import { DEFAULT_VIEW, STRATEGIES } from "./model";
import { isTheme, paintFor, themeById } from "./theme";
import { isView, normalizeEdge } from "./validate";
import type { BoxData, ChildView, Diagram, EdgeData, Id, Items, ListItem } from "./types";

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

// データの箱のキャプション（無ければ空）
export const captionOfData = (s: BoxData | undefined) =>
  s == null || s.caption == null ? "" : String(s.caption);

// ページの名前（最初のページは決まった名前）
// キャプションが空のページは「id_(空)」
export const pageNameOf = (nodes: BoxData[], p: string | null) =>
  p == null ? t("最初のページ") : captionOfData(nodes.find(s => String(s.id) === p)) || keyOf(p, "");

// 一覧の「表示中」とページ（ブック全体）。表示中の箱は、載っているページを添える（ページの箱の直下の子は、親を出さない）。
// current は今描いているページ（ほかのブックの一覧なら undefined で、どのページも current にしない）
// paint は箱の色の印（図で塗っている色。読み込んでいないブックは dataPaint で求める）
export function liveItems(nodes: BoxData[], current: string | null | undefined, paint: (s: BoxData) => string): Pick<Items, "live" | "pages"> {
  const byKey = new Map(nodes.map(s => [String(s.id), s]));
  const live: ListItem[] = nodes.map(s => {
    const p = byKey.get(String(s.parent));
    return {
      id: String(s.id), caption: captionOfData(s),
      color: paint(s),
      parent: p && p.page !== true ? captionOfData(p) || keyOf(p.id, "") : null,
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

// データだけから求める箱の色（サイドバーの一覧の色の印。読み込んでいないブックと、消したボックス）。
// 図（graph.ts の paintOf）と同じく theme.ts の paintFor で塗る。テーマは近い祖先から、ページの中ならページの world、
// ブック全体の world の順に探す。内包の枠かは、子があって並べ方（ツリーの中なら根の並べ方）が枠で見せるものか
export function dataPaint(d: Diagram, plain: string): (s: BoxData) => string {
  const nodes = d.nodes ?? [];
  const byKey = new Map(nodes.map(s => [String(s.id), s]));
  const parentOf = (s: BoxData) => (s.parent != null ? byKey.get(String(s.parent)) : undefined);
  const hasKids = new Set(nodes.filter(s => s.parent != null).map(s => String(s.parent)));
  const viewOf = (s: BoxData): ChildView => (isView(s.childView) ? s.childView as ChildView : DEFAULT_VIEW);
  const themeOfData = (s: BoxData) => {
    let b: BoxData | undefined = s;
    for (; b && b.page !== true; b = parentOf(b)) if (isTheme(b.theme)) return themeById(b.theme);
    if (b && isTheme(b.world?.theme)) return themeById(b.world!.theme);
    return themeById(d.world?.theme);
  };
  const nesting = (s: BoxData) => {
    if (!hasKids.has(String(s.id))) return false;
    let root: BoxData | undefined;
    for (let p = parentOf(s); p && p.page !== true; p = parentOf(p)) if (STRATEGIES[viewOf(p)].descendants) root = p;
    return STRATEGIES[viewOf(root ?? s)].framed;
  };
  return s => paintFor(themeOfData(s), s.color, nesting(s), plain).color;
}
