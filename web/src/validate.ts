// データの検証と正規化。DOM に依存しない。

import { isAccess, isObject as isRecord, memberNames } from "./classbox";
import { isHead } from "./heads";
import { t } from "./i18n";
import { THEMES, isTheme } from "./theme";
import { SHAPE_DEFS } from "./shapes";
import { isLinkLook, isRect } from "./link-box";
import type { BookFormat, BoxView, Diagram, EdgeData, Id, PagePattern, PreviewSide, Shape, Size } from "./types";

export interface SizeSpec {
  minW: number;
  maxW: number; // 文字がこれより長ければ折り返す
  h: number; // 高さの最小（fixedH なら固定）
  fixedH?: boolean;
  limit?: number; // 表示する最大文字数
}

// ボックスの大きさの段階。文字のボックスの幅は、文字に合わせて minW〜maxW の間で決まる。
// 見た目の調整で変えてよい値（テストは test/graph.test.ts の「サイズの段階」）
export const SIZES: Record<Size, SizeSpec> = {
  L: { minW: 120, maxW: 400, h: 64 },
  M: { minW: 120, maxW: 240, h: 64 },
  S: { minW: 64, maxW: 96, h: 44, fixedH: true, limit: 10 },
};

// 子を内包するボックスとワールドの最小の大きさ（サイズによらない）
export const GROUP_MIN = { w: 120, h: 64 };

export const OVERFLOWS = ["wrap", "grow", "clip"] as const;
// 並べ方の戦略の名前（model.ts の STRATEGIES）。パターンはページ単位（2026-10-12 ユーザー）:
// ページ（world.childView）に掛けられるのは PAGE_PATTERNS、箱（childView）に書けるのは BOX_VIEWS（内包パターンの持ち物）
export const VIEWS = ["nest", "tree", "hidden", "list", "flow", "master", "preview"] as const;
// リストの子の縮図の位置（D13）
export const PREVIEW_SIDES = ["right", "left", "none"] as const satisfies readonly PreviewSide[];
export const isPreviewSide = (v: unknown): v is PreviewSide => includes(PREVIEW_SIDES, v);
export const PAGE_PATTERNS = ["nest", "tree", "flow", "master"] as const satisfies readonly PagePattern[];
export const BOX_VIEWS = ["nest", "hidden", "list"] as const satisfies readonly BoxView[];
export const SHAPES = [
  "box", "person", "db", "diamond", "server", "class", "circle", "stadium", "hexagon", "parallelogram", "parallelogramAlt", "trapezoid", "trapezoidAlt",
  "pc", "factory", "document", "trash", "robot", "cat", "heart", "bulb", "dog", "forest", "house", "family",
] as const;
// 形の画面での名前（形を選ぶ絵の並びの、ポインタを乗せたときと読み上げの名前。通知にも使う）
export const SHAPE_LABELS: Record<Shape, string> = {
  box: t("ボックス"), class: t("クラス"), circle: t("円"), stadium: t("角丸"), diamond: t("ひし形"),
  hexagon: t("六角形（準備）"), parallelogram: t("平行四辺形（入出力）"), parallelogramAlt: t("平行四辺形（逆向き）"),
  trapezoid: t("台形（手作業・上が狭い）"), trapezoidAlt: t("台形（下が狭い）"),
  person: t("スティックマン"), db: "DB", server: t("サーバー"), pc: t("パソコン"), factory: t("工場"), document: t("書類"),
  trash: t("ゴミ箱"), robot: t("ロボット"), cat: t("猫の顔"), heart: t("ハート"), bulb: t("電球（ひらめき）"),
  dog: t("犬の顔"), forest: t("森"), house: t("家"), family: t("家族"),
};
// 形を選ぶ絵の並び（shape-picker.ts。サイドバーと編集ダイアログ）。まとまりごとに間を空けて並べる。どの形もどれか 1 つに入る（test が見張る）。
// 向きや角の違う形（円と角丸、平行四辺形と台形の向き）も、それぞれ 1 つの絵として並べる（2026-10-12 ユーザー）
export const SHAPE_GROUPS: { label: string; shapes: Shape[] }[] = [
  { label: t("基本の形"), shapes: ["box", "class", "circle", "stadium", "diamond"] },
  { label: t("フローチャートの形"), shapes: ["hexagon", "parallelogram", "parallelogramAlt", "trapezoid", "trapezoidAlt"] },
  { label: t("絵の形"), shapes: ["person", "db", "server", "pc", "factory", "document", "trash", "robot", "cat", "heart", "bulb", "dog", "forest", "house", "family"] },
];
// ページのパターンの画面での名前（サイドバー・ダイアログ・リンクの箱の札）
// 紙の型（D33。docs/PAPER-plan.md。2026-10-15 ユーザー）: ページの編集領域は伸ばさず、この大きさの紙にする。印刷の大きさ（96dpi）。
// 暫定で、1 行ずつ足していける（足せば新しいページのダイアログの選択肢と、LLM が選べる名前に出る）。紙の制限を受けるかはパターンの定義（STRATEGIES の paper）
export const PAPERS = {
  "a5-portrait": { w: 559, h: 794, label: t("A5 縦") },
  "a5-landscape": { w: 794, h: 559, label: t("A5 横") },
  "a4-portrait": { w: 794, h: 1123, label: t("A4 縦") },
  "a4-landscape": { w: 1123, h: 794, label: t("A4 横") },
  "a3-portrait": { w: 1123, h: 1587, label: t("A3 縦") },
  "a3-landscape": { w: 1587, h: 1123, label: t("A3 横") },
} as const satisfies Record<string, { w: number; h: number; label: string }>;
export type PaperName = keyof typeof PAPERS;
export const PAPER_NAMES = Object.keys(PAPERS) as PaperName[];
export const DEFAULT_PAPER: PaperName = "a4-landscape";
export const isPaper = (v: unknown): v is PaperName => typeof v === "string" && Object.hasOwn(PAPERS, v);

export const PATTERN_LABELS: Record<PagePattern, string> = { nest: t("内包"), tree: t("ツリー"), flow: t("フローチャート"), master: t("マスター") };
// パターンごとのファイルの形式（D26 の段階 2。2026-10-14 ユーザー: 形式の切り替えもパターンの定義の項目で決める）。
// データの検査は DOM の無い CLI でも使うので、パターンの名前と見出しと同じくここに置く。形式ごとの決まりは下の FORMAT_RULES
export const PAGE_FORMATS: Record<PagePattern, BookFormat> = { nest: "book", tree: "book", flow: "book", master: "master" };
// 形式ごとの決まり: bookLinks は窓（book）を書けるか、pages は 2 枚目からのページを持てるか
export const FORMAT_RULES: Record<BookFormat, { bookLinks: boolean; pages: boolean }> = {
  book: { bookLinks: false, pages: true },
  master: { bookLinks: true, pages: false },
};
// ファイルの形式（最初のページのパターンで決まる。マスターのパターンはマスター用のファイルの最初のページにだけ書ける）
export const formatOf = (d: { world?: { childView?: unknown } }): BookFormat => (isPattern(d.world?.childView) ? PAGE_FORMATS[d.world!.childView] : "book");
export const TREE_DIRECTIONS = ["down", "up", "left", "right"] as const;
export const ARROWS = ["start", "end", "both"] as const;
export const DASHES = ["solid", "dashed"] as const;
export const ROUTES = ["straight", "elbow"] as const;
export const AXES = ["horizontal", "vertical"] as const;
export const isRoute = (v: unknown) => includes(ROUTES, v);

const includes = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T);
export const isSize = (v: unknown): v is Size => typeof v === "string" && v in SIZES;
export const isOverflow = (v: unknown) => includes(OVERFLOWS, v);
export const isView = (v: unknown): v is BoxView => includes(BOX_VIEWS, v);
export const isPattern = (v: unknown): v is PagePattern => includes(PAGE_PATTERNS, v);
export const isShape = (v: unknown) => includes(SHAPES, v);
export const isTreeDirection = (v: unknown) => includes(TREE_DIRECTIONS, v);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function normalizeEdge(e: EdgeData | [Id, Id]): EdgeData {
  if (Array.isArray(e)) return { from: e[0], to: e[1] };
  return { ...e };
}

// 箱とワールドの設定の値。誤りの文を返す（無ければ空）。
// theme が false なら、知らないテーマの名前は誤りにしない（画面で開くとき。標準として描き、知らせる。名前を変えたり減らしたりしても図が開けるように）
// world が true なら、ワールド（ページ）の設定として調べる（childView はページのパターン、treeDirection と root を持てる）
export function settingsProblems(s: Record<string, unknown>, where: unknown, theme = true, world = false): string[] {
  const out: string[] = [];
  if (world) {
    if (s.childView != null && !isPattern(s.childView)) out.push(t("world の childView に使えるのは nest / tree / flow です: {where} ({value})", { where, value: s.childView }));
    if (s.treeDirection != null && !isTreeDirection(s.treeDirection)) out.push(t("treeDirection の値が不正です: {where} ({value})", { where, value: s.treeDirection }));
    if (s.paper != null && !isPaper(s.paper)) out.push(t("paper（紙の型）の値が不正です: {where} ({value})。使えるのは {papers}", { where, value: s.paper, papers: PAPER_NAMES.join(" / ") }));
  }
  if (s.overflow != null && !isOverflow(s.overflow)) out.push(t("overflow の値が不正です: {where} ({value})", { where, value: s.overflow }));
  if (s.size != null && !isSize(s.size)) out.push(t("size の値が不正です: {where} ({value})", { where, value: s.size }));
  if (s.shape != null && !isShape(s.shape)) out.push(t("shape の値が不正です: {where} ({value})", { where, value: s.shape }));
  if (s.body != null && typeof s.body !== "string") out.push(t("body は文字列にしてください: {where}", { where }));
  if (s.width != null && !(typeof s.width === "number" && s.width > 0)) out.push(t("width は正の数にしてください: {where} ({value})", { where, value: s.width }));
  if (s.bodyWidth != null && !(typeof s.bodyWidth === "number" && s.bodyWidth > 0)) out.push(t("bodyWidth は正の数にしてください: {where} ({value})", { where, value: s.bodyWidth }));
  if (s.bodyLines != null && !(Number.isInteger(s.bodyLines) && (s.bodyLines as number) > 0)) out.push(t("bodyLines は 1 以上の整数にしてください: {where} ({value})", { where, value: s.bodyLines }));
  if (s.userAdded != null && typeof s.userAdded !== "boolean") out.push(t("userAdded は true か false にしてください: {where} ({value})", { where, value: s.userAdded }));
  if (s.bodyRule != null && typeof s.bodyRule !== "boolean") out.push(t("bodyRule は true か false にしてください: {where} ({value})", { where, value: s.bodyRule }));
  if (s.kidSize != null && !isSize(s.kidSize)) out.push(t("kidSize の値が不正です: {where} ({value})", { where, value: s.kidSize }));
  // 箱の childView は内包パターンの見せ方だけ。ツリーとフローチャートはページのパターン（world.childView）なので、箱に書いたら直し方を案内する
  if (!world && s.childView != null && !isView(s.childView)) {
    out.push(s.childView === "tree"
      ? t("childView の tree は箱には書けません（ページのパターンなので、world.childView に tree、world.root に根の箱の id を書きます）: {where}", { where })
      : includes(PAGE_PATTERNS, s.childView)
      ? t("childView の {value} は箱には書けません（ページのパターンなので world.childView に書きます）: {where}", { where, value: s.childView })
      : t("childView の値が不正です: {where} ({value})", { where, value: s.childView }));
  }
  if (!world && s.treeDirection != null) out.push(t("treeDirection は箱には書けません（ツリーのページの world.treeDirection に書きます）: {where}", { where }));
  if (s.rowSize != null && !isSize(s.rowSize)) out.push(t("rowSize に使えるのは L / M / S です: {where} ({value})", { where, value: s.rowSize }));
  if (s.previewSide != null && !isPreviewSide(s.previewSide)) out.push(t("previewSide に使えるのは right / left / none です: {where} ({value})", { where, value: s.previewSide }));
  if (s.linkLook != null && !isLinkLook(s.linkLook)) out.push(t("linkLook に使えるのは window / side です: {where} ({value})", { where, value: s.linkLook }));
  if (s.clip != null && !isRect(s.clip)) out.push(t("clip は { x, y, w, h } の四角（w と h は正の数）にしてください: {where}", { where }));
  if (theme && s.theme != null && !isTheme(s.theme)) {
    out.push(t("theme の値が不正です: {where} ({value})。使えるのは {themes}", { where, value: s.theme, themes: THEMES.map(x => x.id).join(" / ") }));
  }
  return out;
}

export function checkSettings(s: Record<string, unknown>, where: unknown, world = false): void {
  const [first] = settingsProblems(s, where, true, world);
  if (first) throw new Error(first);
}

// id の無いボックスに連番を振る（既存の数値 id の続きから。消したボックスの id も使用済みとして数える）
export function assignIds(data: unknown): void {
  if (!isObject(data) || !Array.isArray(data.nodes)) return;
  const nodes: unknown[] = data.nodes;
  const removed: unknown[] = Array.isArray(data.removed) ? data.removed : [];
  const used = [...nodes, ...removed].map(n => Number(isObject(n) ? n.id : NaN)).filter(Number.isInteger);
  let next = Math.max(0, ...used) + 1;
  for (const n of nodes) {
    if (isObject(n) && n.id == null) n.id = next++;
  }
}

// 図のデータの誤りを全部挙げる（無ければ空）。画面は最初の 1 つで止める（validate）。
// CLI（matomezu validate）も、ビルドしたこの関数を実行ファイルに埋め込んで使う（validate-cli.ts、internal/validate）
export function problems(data: unknown): string[] {
  const out: string[] = [];
  inspect(data, m => { out.push(m); }, true);
  return out;
}

// 画面で開くときの検査。知らないテーマの名前は誤りにしない（標準として描く。graph.ts の unknownThemes で知らせる）
export function validate(data: unknown): asserts data is Diagram {
  inspect(data, m => { throw new Error(m); }, false);
}

// 誤りを見つけるたびに fail を呼ぶ。fail が例外を投げれば最初の 1 つで止まる。投げなければ、続けられる所から調べ続ける。
// theme が false なら、知らないテーマの名前は誤りにしない
function inspect(data: unknown, fail: (message: string) => void, theme: boolean): void {
  if (!isObject(data) || !Array.isArray(data.nodes)) return fail(t("nodes 配列がありません"));
  if (data.world != null) {
    if (!isObject(data.world)) fail(t("world がオブジェクトではありません"));
    else {
      settingsProblems(data.world, "world", theme, true).forEach(fail);
      if (data.world.overflow === "grow") fail(t("world に overflow: grow は使えません"));
      if (data.world.route != null && !includes(ROUTES, data.world.route)) fail(t("world の route の値が不正です: {value}", { value: data.world.route }));
      if (data.world.background != null && typeof data.world.background !== "string") fail(t("world の background は色の文字列にしてください"));
      if (data.world.title != null && typeof data.world.title !== "string") fail(t("world の title は文字列にしてください"));
      if (data.world.madeBy != null && data.world.madeBy !== "user") fail(t("world の madeBy に書けるのは user だけです（画面で作ったブックの印）: {value}", { value: data.world.madeBy }));
    }
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const n of data.nodes as unknown[]) {
    if (!isObject(n) || n.id == null) { fail(t("空のノードがあります")); continue; }
    if (byId.has(String(n.id))) { fail(t("id が重複しています: {id}", { id: n.id })); continue; }
    byId.set(String(n.id), n);
    settingsProblems(n, n.id, theme).forEach(fail);
    classProblems(n).forEach(fail);
  }
  // 消したボックス。id は nodes と重ならないこと（parent は消したボックスや、もう無い id でもよい）
  if (data.removed != null && !Array.isArray(data.removed)) fail(t("removed が配列ではありません"));
  const removedIds = new Set<string>();
  for (const n of (Array.isArray(data.removed) ? data.removed : []) as unknown[]) {
    if (!isObject(n) || n.id == null) { fail(t("removed に空のノードがあります")); continue; }
    if (byId.has(String(n.id)) || removedIds.has(String(n.id))) { fail(t("id が重複しています: {id}", { id: n.id })); continue; }
    removedIds.add(String(n.id));
  }
  for (const n of byId.values()) {
    if (n.parent == null) continue;
    if (!byId.has(String(n.parent))) { fail(t("存在しない親です: {id} → {parent}", { id: n.id, parent: n.parent })); continue; }
    const seen = new Set([String(n.id)]);
    for (let p: unknown = n.parent; p != null; p = byId.get(String(p))?.parent) {
      if (seen.has(String(p))) { fail(t("親子関係が循環しています: {id}", { id: n.id })); break; }
      seen.add(String(p));
    }
  }
  // クラスの箱は子を持たない（docs/CLASS-plan.md）
  for (const n of byId.values()) {
    if (n.parent != null && SHAPE_DEFS[byId.get(String(n.parent))?.shape as Shape]?.kids === false) fail(t("クラスの箱は子を持てません: {id} → {parent}", { id: n.id, parent: n.parent }));
  }
  // ページ（pages。2026-10-12 ユーザー: ページはブックの子。docs/TABS-plan.md）: id が重ならず、world はワールドの設定。
  // 箱の page はそのページの id で、最上位の箱にだけ書く。昔の page: true（箱の中身をページにする）と箱の world は誤りにし、直し方を案内する
  const pages = new Map<string, Record<string, unknown>>();
  if (data.pages != null && !Array.isArray(data.pages)) fail(t("pages が配列ではありません"));
  for (const p of (Array.isArray(data.pages) ? data.pages : []) as unknown[]) {
    if (!isObject(p) || p.id == null) { fail(t("pages に id の無いページがあります")); continue; }
    if (pages.has(String(p.id))) { fail(t("ページの id が重複しています: {id}", { id: p.id })); continue; }
    pages.set(String(p.id), p);
    if (p.title != null && typeof p.title !== "string") fail(t("ページの title は文字列にしてください: {id}", { id: p.id }));
    if (p.world != null) {
      if (!isObject(p.world)) fail(t("world がオブジェクトではありません: {id}", { id: p.id }));
      else {
        settingsProblems(p.world, t("ページ {id} の world", { id: p.id }), theme, true).forEach(fail);
        if (p.world.overflow === "grow") fail(t("world に overflow: grow は使えません: {id}", { id: p.id }));
        if (p.world.route != null && !includes(ROUTES, p.world.route)) fail(t("world の route の値が不正です: {id} ({value})", { id: p.id, value: p.world.route }));
      }
    }
  }
  for (const n of byId.values()) {
    if (n.world != null) fail(t("箱に world は書けません（ページの設定は pages の world に書きます）: {id}", { id: n.id }));
    if (n.page == null) continue;
    if (n.page === true || n.page === false) { fail(t("page: true はもう使えません（ページは pages に書き、載せる箱に page: ページの id を書きます）: {id}", { id: n.id })); continue; }
    if (!pages.has(String(n.page))) { fail(t("存在しないページです: {id} → {page}", { id: n.id, page: n.page })); continue; }
    if (n.parent != null) fail(t("page は最上位の箱にだけ書けます（中の箱は親と同じページに載ります）: {id}", { id: n.id }));
  }
  // ファイルの形式（PAGE_FORMATS。D26 の段階 2）: マスターのパターンは最初のページにだけ書け、マスター用のファイルにする。
  // マスター用のファイルは 2 枚目からのページを持たず、窓（book）を書ける。ほかのファイルには book を書けない
  const format = formatOf(data as { world?: { childView?: unknown } });
  for (const p of pages.values()) {
    if (isObject(p.world) && isPattern(p.world.childView) && PAGE_FORMATS[p.world.childView] !== "book") {
      fail(t("{pattern} のパターンはページには書けません（マスター用のファイルの最初のページだけ）: {id}", { pattern: p.world.childView, id: p.id }));
    }
  }
  if (!FORMAT_RULES[format].pages && pages.size) fail(t("マスター用のファイルは 2 枚目からのページを持てません"));
  for (const n of byId.values()) {
    if (n.book == null) continue;
    if (!FORMAT_RULES[format].bookLinks) fail(t("book（ブックの窓）はマスター用のファイルにだけ書けます: {id}", { id: n.id }));
    else if (typeof n.book !== "string" || !n.book) fail(t("book はブックの id の文字列にしてください: {id}", { id: n.id }));
    if (n.link != null) fail(t("book と link は一緒に書けません: {id}", { id: n.id }));
  }
  // リンクの箱（link-box.ts）: link は存在するページの id で、自分の載っているページではない。子を持てない
  const hasKids = new Set([...byId.values()].filter(n => n.parent != null).map(n => String(n.parent)));
  for (const n of byId.values()) {
    if (n.book != null && hasKids.has(String(n.id))) fail(t("ブックの窓は子を持てません: {id}", { id: n.id }));
    if (n.link == null) continue;
    if (!pages.has(String(n.link))) { fail(t("存在しないページへのリンクです: {id} → {page}", { id: n.id, page: n.link })); continue; }
    if (hasKids.has(String(n.id))) fail(t("リンクの箱は子を持てません: {id}", { id: n.id }));
  }
  // ページのパターンの決まり（docs/PATTERN-plan.md。model.ts の STRATEGIES の leafKids・rootOnly。
  // この検査は DOM なしの CLI でも動かすので、戦略の表は読まずに名前で見る）
  const topOf = (n: Record<string, unknown>) => { // そのページの最上位の祖先（自分かもしれない）
    let top = n;
    const seen = new Set<unknown>();
    for (let p = byId.get(String(top.parent)); p && !seen.has(p); p = byId.get(String(p.parent))) { seen.add(p); top = p; }
    return top;
  };
  const pageKeyOf = (n: Record<string, unknown>) => { const t = topOf(n); return t.page == null ? null : String(t.page); };
  const worldOfPage = (key: string | null): Record<string, unknown> => {
    const w = key == null ? data.world : pages.get(key)?.world;
    return isObject(w) ? w : {};
  };
  for (const n of byId.values()) {
    if (n.link != null && pages.has(String(n.link)) && String(n.link) === pageKeyOf(n)) fail(t("自分の載っているページへはリンクできません: {id}", { id: n.id }));
  }
  for (const n of byId.values()) {
    if (n.parent == null) continue;
    const world = worldOfPage(pageKeyOf(n));
    // フローチャート: 最上位の箱が子を持てない
    if (world.childView === "flow") fail(t("フローチャートの中の箱は子を持てません: {id} → {parent}", { id: n.id, parent: n.parent }));
    // ツリー: 子を持てるのは根の子孫だけ（根は world.root で指す）
    if (world.childView === "tree" && String(topOf(n).id) !== String(world.root)) {
      fail(t("ツリーのページで子を持てるのは根（world.root）の子孫だけです: {id} → {parent}", { id: n.id, parent: n.parent }));
    }
  }
  // ツリーのページは根（world.root）が要り、そのページの最上位の箱を指す
  const checkRoot = (world: Record<string, unknown>, pageId: string | null) => {
    if (world.childView !== "tree") return;
    const root = world.root != null ? byId.get(String(world.root)) : undefined;
    const ok = root && root.parent == null && (root.page == null ? null : String(root.page)) === pageId;
    if (!ok) fail(t("ツリーのページには根が要ります（world.root に、そのページの最上位の箱の id）: {where}", { where: pageId ?? "world" }));
    else if (root.link != null) fail(t("ツリーの根はリンクの箱にできません: {id}", { id: root.id }));
  };
  checkRoot(worldOfPage(null), null);
  for (const [key, p] of pages) if (isObject(p.world)) checkRoot(p.world, key);
  const parentOf = (id: unknown) => {
    const p = byId.get(String(id))?.parent;
    return p == null ? null : String(p);
  };
  if (data.edges != null && !Array.isArray(data.edges)) fail(t("edges が配列ではありません"));
  const edgeIds = new Set<string>();
  for (const e of (Array.isArray(data.edges) ? data.edges : []) as unknown[]) {
    if (!isObject(e) && !Array.isArray(e)) { fail(t("空の線があります")); continue; }
    const { id, from, to } = normalizeEdge(e as EdgeData | [Id, Id]);
    if (!byId.has(String(from)) || !byId.has(String(to))) { fail(t("存在しないノードへの線があります: {from} - {to}", { from, to })); continue; }
    const caption = (e as EdgeData).caption;
    if (caption != null && typeof caption !== "string") fail(t("線の caption は文字列にしてください: {from} - {to}", { from, to }));
    const captionAt = (e as EdgeData).captionAt;
    if (captionAt != null && !(typeof captionAt === "number" && captionAt >= 0 && captionAt <= 1)) fail(t("captionAt は 0 から 1 の数にしてください: {from} - {to}", { from, to }));
    const captionOffset = (e as EdgeData).captionOffset;
    if (captionOffset != null && !Number.isFinite(captionOffset)) fail(t("captionOffset は数にしてください: {from} - {to}", { from, to }));
    const arrow = (e as EdgeData).arrow;
    if (arrow != null && !includes(ARROWS, arrow)) fail(t("arrow の値が不正です: {from} - {to} ({value})", { from, to, value: arrow }));
    for (const k of ["startHead", "endHead"] as const) {
      const v = (e as EdgeData)[k];
      if (v != null && !isHead(v)) fail(t("{k} の値が不正です: {from} - {to} ({value})", { k, from, to, value: v }));
    }
    const route = (e as EdgeData).route;
    if (route != null && !includes(ROUTES, route)) fail(t("route の値が不正です: {from} - {to} ({value})", { from, to, value: route }));
    for (const k of ["exit", "enter"] as const) {
      const v = (e as EdgeData)[k];
      if (v != null && !includes(AXES, v)) fail(t("{key} の値が不正です: {from} - {to} ({value})", { key: k, from, to, value: v }));
    }
    for (const k of ["exitAt", "enterAt"] as const) {
      const v = (e as EdgeData)[k];
      if (v != null && !(typeof v === "number" && v >= 0 && v <= 1)) fail(t("{key} は 0 から 1 の数にしてください: {from} - {to} ({value})", { key: k, from, to, value: v }));
    }
    const via = (e as EdgeData).via;
    if (via != null && !(Array.isArray(via) && via.every(v => typeof v === "number" && Number.isFinite(v)))) {
      fail(t("via は数の並びにしてください: {from} - {to}", { from, to }));
    }
    const bend = (e as EdgeData).bend;
    if (bend != null && !(typeof bend === "number" && bend > 0 && bend < 1)) fail(t("bend は 0 より大きく 1 より小さい数にしてください: {from} - {to} ({value})", { from, to, value: bend }));
    const dash = (e as EdgeData).dash;
    if (dash != null && !includes(DASHES, dash)) fail(t("dash の値が不正です: {from} - {to} ({value})", { from, to, value: dash }));
    for (const [key, end] of [["fromMember", from], ["toMember", to]] as const) {
      const m = (e as EdgeData)[key];
      if (m == null) continue;
      const box = byId.get(String(end))!;
      if (typeof m !== "string") fail(t("{key} は属性か操作の名前にしてください: {from} - {to}", { key, from, to }));
      else if (box.shape !== "class") fail(t("{key} はクラスの箱の端にだけ書けます: {from} - {to}", { key, from, to }));
      else if (!memberNames(box).includes(m)) fail(t("{key} の属性・操作がありません: {from} - {to} ({value})", { key, from, to, value: m }));
    }
    if (parentOf(from) !== parentOf(to)) fail(t("階層の違うボックス同士の線があります: {from} - {to}", { from, to }));
    else if (pageKeyOf(byId.get(String(from))!) !== pageKeyOf(byId.get(String(to))!)) {
      fail(t("ページの違うボックス同士の線があります（ページをまたぐ関連は、そのページへのリンクの箱（link）を置いて線を引きます）: {from} - {to}", { from, to }));
    }
    if (id != null) {
      if (edgeIds.has(String(id))) fail(t("線の id が重複しています: {id}", { id }));
      edgeIds.add(String(id));
    }
  }
}

// クラスの箱の属性・操作の誤り（docs/CLASS-plan.md）。名前は属性と操作を通して重ねられない
function classProblems(n: Record<string, unknown>): string[] {
  const out: string[] = [];
  const names = new Set<string>();
  const id = n.id;
  if (n.abstract != null && typeof n.abstract !== "boolean") out.push(t("abstract は true か false にしてください: {id}", { id }));
  for (const key of ["attrs", "ops"] as const) {
    if (n[key] == null) continue;
    if (!Array.isArray(n[key])) { out.push(t("{key} は配列にしてください: {id}", { key, id })); continue; }
    for (const m of n[key] as unknown[]) {
      if (!isRecord(m) || typeof m.name !== "string" || !m.name) { out.push(t("{key} に名前の無い行があります: {id}", { key, id })); continue; }
      if (m.access != null && !isAccess(m.access)) out.push(t("access の値が不正です: {id} の {name} ({value})", { id, name: m.name, value: m.access }));
      for (const f of ["static", "abstract"]) {
        if (m[f] != null && typeof m[f] !== "boolean") out.push(t("{field} は true か false にしてください: {id} の {name}", { field: f, id, name: m.name }));
      }
      for (const f of ["type", "params"]) {
        if (m[f] != null && typeof m[f] !== "string") out.push(t("{field} は文字列にしてください: {id} の {name}", { field: f, id, name: m.name }));
      }
      if (names.has(m.name)) out.push(t("属性・操作の名前が重なっています: {id} の {name}", { id, name: m.name }));
      names.add(m.name);
    }
  }
  return out;
}
