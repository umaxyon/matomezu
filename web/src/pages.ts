// ブックの中のページ（docs/TABS-plan.md。2026-10-12 ユーザー: ページはブックの子）。データだけを見る関数。DOM に依存しない。
// 2 枚目からのページは data.pages に並び、最上位の箱は page: ページの id でそのページに載る（無ければ最初のページ = null）。
// 中の箱は親と同じページ

import { keyOf } from "./dom";
import { t } from "./i18n";
import { DEFAULT_VIEW, STRATEGIES } from "./model";
import { isTheme, paintFor, themeById } from "./theme";
import { isPattern, isView, normalizeEdge } from "./validate";
import type { BoxData, BoxView, Diagram, EdgeData, Id, Items, ListItem, PageData, WorldData } from "./types";

const key = (id: Id | undefined) => (id == null ? null : String(id));

function parents(nodes: BoxData[]) {
  return new Map(nodes.map(s => [String(s.id), key(s.parent)]));
}

// 箱が載っているページ（最上位の祖先の page。無ければ null = 最初のページ）
export function pageOf(nodes: BoxData[], id: Id): string | null {
  const parent = parents(nodes);
  const byId = new Map(nodes.map(s => [String(s.id), s]));
  let top = String(id);
  const seen = new Set<string>();
  for (let p = parent.get(top); p != null && !seen.has(p); p = parent.get(p) ?? null) { seen.add(p); top = p; }
  return key(byId.get(top)?.page);
}

// ページ（null は最初のページ）に載っている箱の id を、データの並び順で返す
export function pageMembers(nodes: BoxData[], page: string | null): string[] {
  return nodes.filter(s => pageOf(nodes, s.id!) === page).map(s => String(s.id));
}

// ブックのページの一覧（2 枚目から。データの並び順）
export const pagesOf = (d: Diagram): PageData[] => (Array.isArray(d.pages) ? d.pages : []);
// ページのデータ（null は最初のページなので undefined）
export const pageData = (d: Diagram, page: string | null): PageData | undefined =>
  (page == null ? undefined : pagesOf(d).find(p => String(p.id) === page));
// ページ（null は最初のページ）のワールドの設定（無ければ空）
export const pageWorld = (d: Diagram, page: string | null): WorldData => (page == null ? d.world : pageData(d, page)?.world) ?? {};

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

// データの箱のキャプション（無ければ空）
export const captionOfData = (s: BoxData | undefined) =>
  s == null || s.caption == null ? "" : String(s.caption);

// ページの名前（最初のページは決まった名前。題名が空のページは「id_(空)」）
export const pageNameOf = (d: Diagram, p: string | null) => {
  if (p == null) return t("最初のページ");
  const title = pageData(d, p)?.title;
  return typeof title === "string" && title.trim() ? title.trim() : keyOf(p, "");
};

// 一覧の「表示中」とページ（ブック全体）。表示中の箱は、載っているページを添える。
// current は今描いているページ（ほかのブックの一覧なら undefined で、どのページも current にしない）
// paint は箱の色の印（図で塗っている色。読み込んでいないブックは dataPaint で求める）
export function liveItems(d: Diagram, current: string | null | undefined, paint: (s: BoxData) => string): Pick<Items, "live" | "pages"> {
  const nodes = d.nodes ?? [];
  const byKey = new Map(nodes.map(s => [String(s.id), s]));
  const live: ListItem[] = nodes.map(s => {
    const p = byKey.get(String(s.parent));
    return {
      id: String(s.id), caption: captionOfData(s),
      color: paint(s),
      parent: p ? captionOfData(p) || keyOf(p.id, "") : null,
      page: pageOf(nodes, s.id!),
    };
  });
  const pages = [null, ...pagesOf(d).map(p => String(p.id))]
    .map(id => ({ id, caption: pageNameOf(d, id), current: id === current }));
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
  const viewOf = (s: BoxData): BoxView => (isView(s.childView) ? s.childView : DEFAULT_VIEW);
  // そのページの最上位の祖先と、箱が載っているページの world（最上位の箱の page のページ。無ければ data.world）
  const topOf = (s: BoxData): BoxData => {
    let top = s;
    for (let p = parentOf(top); p; p = parentOf(p)) top = p;
    return top;
  };
  const pageWorldOf = (s: BoxData): WorldData => pageWorld(d, key(topOf(s).page));
  // テーマは近い祖先から。無ければページの world、それも無ければブック全体の world
  const themeOfData = (s: BoxData) => {
    for (let b: BoxData | undefined = s; b; b = parentOf(b)) if (isTheme(b.theme)) return themeById(b.theme);
    const w = pageWorldOf(s);
    if (isTheme(w.theme)) return themeById(w.theme);
    return themeById(d.world?.theme);
  };
  // 枠で見せる箱か。ツリーのページの根の木の中（根を含む）はツリーの節（枠ではない）、それ以外は自分の見せ方で決まる
  const nesting = (s: BoxData) => {
    if (!hasKids.has(String(s.id))) return false;
    const w = pageWorldOf(s);
    const pattern = isPattern(w.childView) ? w.childView : DEFAULT_VIEW;
    if (STRATEGIES[pattern].descendants && String(topOf(s).id) === String(w.root)) return STRATEGIES[pattern].framed;
    return STRATEGIES[viewOf(s)].framed;
  };
  return s => paintFor(themeOfData(s), s.color, nesting(s), plain).color;
}
