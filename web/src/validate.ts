// データの検証と正規化。DOM に依存しない。

import { ACCESSES, type ClassAttr, type ClassOp, memberNames } from "./classbox";
import { HEADS } from "./heads";
import { t } from "./i18n";
import { THEMES, isTheme } from "./theme";
import { SHAPE_DEFS } from "./shapes";
import { LINK_LOOKS, isRect } from "./link-box";
import type { BookFormat, BoxData, BoxView, Diagram, EdgeData, Id, PageData, PagePattern, PreviewSide, Shape, Size, WorldData } from "./types";

// データに書ける段（size・rowSize・kidSize）の名前。段の値（幅の範囲・高さなど）は、ふつうの形のローカルなルール（size-rules.ts の STEPS。D44）
export const SIZE_NAMES = ["L", "M", "S"] as const satisfies readonly Size[];

// 子を内包するボックスとワールドの最小の大きさ（サイズによらない）

export const OVERFLOWS = ["wrap", "clip"] as const; // データに書ける文字の箱の中身の扱い（子を持つ箱はつねに子に合わせて伸びる。docs/SIZE-plan.md）
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
// 形式ごとの決まり: pages は 2 枚目からのページを持てるか（ブックへの窓 book は、2026-10-16 からどちらの形式にも書ける。D29）
export const FORMAT_RULES: Record<BookFormat, { pages: boolean }> = {
  book: { pages: true },
  master: { pages: false },
};
// ファイルの形式（最初のページのパターンで決まる。マスターのパターンはマスター用のファイルの最初のページにだけ書ける）
export const formatOf = (d: { world?: { childView?: unknown } }): BookFormat => (isPattern(d.world?.childView) ? PAGE_FORMATS[d.world!.childView] : "book");
export const TREE_DIRECTIONS = ["down", "up", "left", "right"] as const;
export const ARROWS = ["start", "end", "both"] as const;
export const DASHES = ["solid", "dashed"] as const;
export const ROUTES = ["straight", "elbow"] as const;
export const isRoute = (v: unknown) => includes(ROUTES, v);

const includes = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T);
export const isSize = (v: unknown): v is Size => typeof v === "string" && (SIZE_NAMES as readonly string[]).includes(v);
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

// 線の新しい id（"e" と番号）を作る関数を返す。番号は start から数え、used（使っている線の id）に無い最初の番号。
// 作った id は used に足すので、続けて呼べば重ならない（線の id の採番はここ 1 か所）
export function edgeIdMaker(used: Set<string>, start = 1): () => string {
  let seq = start;
  return () => {
    while (used.has("e" + seq)) seq++;
    used.add("e" + seq);
    return "e" + seq;
  };
}

// 箱の新しい id（消した箱の id も使用済みとして数え、その最大の次）。箱の id の採番はここ 1 か所。
// fractions は小数の id（2.5 など）も数えるか。画面の追加・貼り付けは数え（2.5 があれば 3.5）、id の無い箱への連番（assignIds）は整数だけを数える
export function nextBoxId(data: { nodes: unknown[]; removed?: unknown[] }, fractions: boolean): number {
  const used = [...data.nodes, ...(data.removed ?? [])].map(n => Number(isObject(n) ? n.id : NaN))
    .filter(fractions ? Number.isFinite : Number.isInteger);
  return Math.max(0, ...used) + 1;
}

// ---- スキーマ（2026-10-17 ユーザー: データの形は型で決め、表に無い項目は誤りにする） ----
// 場所（最初のページの world・ページの world・ページ・箱・線・クラスの属性と操作・最上位）ごとに、置いてよい項目と値の決まりを表にする。
// 表に無い項目は、どの場所でも誤り（未知の項目を残す決まりは 2026-10-17 にやめた。足したい項目は型と表に足す）。
// 表の鍵は types.ts の型の項目と一致しないとビルドが通らない（satisfies Record<keyof ..., Rule>）。
// 箱どうしの関係を見る決まり（親・ページ・ツリーの根・線の両端など）は表ではなく inspect に書く

// 値の決まり。expect は誤りの文に出す「使える値」、good・bad はテストが表から回す見本（test/schema.test.ts）
export interface Rule {
  expect: string;
  ok(v: unknown, o: { theme: boolean }): boolean;
  good: unknown[];
  bad: unknown[];
  hint?(v: unknown): string | null; // 誤りの文に添える直し方（無ければ null）
}
const oneOf = (list: readonly unknown[]): Rule => ({ expect: list.join(" / "), ok: v => list.includes(v), good: [...list], bad: ["?", 1] });
const STR: Rule = { expect: t("文字列"), ok: v => typeof v === "string", good: ["", "a"], bad: [1, true] };
const TEXT: Rule = { expect: t("空でない文字列"), ok: v => typeof v === "string" && !!v, good: ["a"], bad: ["", 1] };
const BOOL: Rule = { expect: t("true か false"), ok: v => typeof v === "boolean", good: [true, false], bad: ["true", 1] };
const NUM: Rule = { expect: t("数"), ok: v => typeof v === "number" && Number.isFinite(v), good: [0, -5, 1.5], bad: ["1", true] };
const POS: Rule = { expect: t("正の数"), ok: v => typeof v === "number" && v > 0 && Number.isFinite(v), good: [1, 0.5], bad: [0, -1, "1"] };
const POS_INT: Rule = { expect: t("1 以上の整数"), ok: v => Number.isInteger(v) && (v as number) > 0, good: [1, 3], bad: [0, 1.5, "2"] };
const FRAC: Rule = { expect: t("0 から 1 の数"), ok: v => typeof v === "number" && v >= 0 && v <= 1, good: [0, 0.5, 1], bad: [-0.1, 1.1, "0.5"] };
const NUMS: Rule = { expect: t("数の並び"), ok: v => Array.isArray(v) && v.every(x => typeof x === "number" && Number.isFinite(x)), good: [[], [1, 2.5]], bad: [[1, "a"], 1] };
const ID: Rule = { expect: t("id（数か文字列）"), ok: v => typeof v === "number" || (typeof v === "string" && !!v), good: [1, "p2"], bad: [true, "", {}] };
const OBJ: Rule = { expect: t("オブジェクト"), ok: isObject, good: [{}], bad: [[], 1] };
const LIST: Rule = { expect: t("配列"), ok: Array.isArray, good: [[]], bad: [{}, 1] };
const RECT: Rule = { expect: t("{ x, y, w, h } の四角（w と h は正の数）"), ok: isRect, good: [{ x: 0, y: 0, w: 1, h: 1 }], bad: [{ x: 0, y: 0, w: 0, h: 1 }, "r"] };
const THEME: Rule = {
  expect: THEMES.map(x => x.id).join(" / "),
  // 画面で開くとき（theme: false）は、知らないテーマの名前も通す（標準として描いて知らせる。名前を変えても図が開けるように）
  ok: (v, o) => (o.theme ? isTheme(v) : typeof v === "string"), good: THEMES.map(x => x.id), bad: [1],
};
const BOX_VIEW: Rule = {
  ...oneOf(BOX_VIEWS),
  hint: v => (v === "tree" ? t("（tree はページのパターンなので、world.childView に tree、world.root に根の箱の id を書きます）")
    : includes(PAGE_PATTERNS, v) ? t("（{value} はページのパターンなので、world.childView に書きます）", { value: v }) : null),
};

// 最初のページの world（ブック全体の設定を含む）
export const WORLD_FIELDS = {
  width: POS, height: POS, // 紙を持たないページ（マスター）の広さ
  background: STR, route: oneOf(ROUTES), theme: THEME, kidSize: oneOf(SIZE_NAMES),
  childView: { ...oneOf(PAGE_PATTERNS), bad: ["list", 1] }, root: ID, treeDirection: oneOf(TREE_DIRECTIONS),
  madeBy: oneOf(["user"]), paper: oneOf(PAPER_NAMES), title: STR,
} as const satisfies Record<keyof Required<WorldData>, Rule>;
// ブック全体の world にだけ書ける項目（ページの world には書かない）
export const BOOK_WORLD_ONLY: readonly (keyof WorldData)[] = ["title", "madeBy"];
export const PAGE_FIELDS = { id: ID, title: STR, world: OBJ } as const satisfies Record<keyof Required<PageData>, Rule>;
export const BOX_FIELDS = {
  id: ID, caption: STR, body: STR, bodyWidth: POS, bodyRule: BOOL, bodyLines: POS_INT, userAdded: BOOL,
  parent: ID, x: NUM, y: NUM, width: POS, height: POS, fixedWidth: BOOL, fixedHeight: BOOL, color: STR, theme: THEME,
  size: oneOf(SIZE_NAMES), shape: oneOf(SHAPES), childView: BOX_VIEW, fill: BOOL, border: BOOL, overflow: oneOf(OVERFLOWS),
  page: ID, book: TEXT, link: ID, linkLook: oneOf(LINK_LOOKS), clip: RECT,
  previewSide: oneOf(PREVIEW_SIDES), rowSize: oneOf(SIZE_NAMES), listHeight: POS,
  abstract: BOOL, attrs: LIST, ops: LIST,
} as const satisfies Record<keyof Required<BoxData>, Rule>;
// 箱の種類だけが持つ項目: 窓（リンクの箱・ブックの窓）の見せ方と映す範囲、クラスの箱の属性と操作
export const WINDOW_ONLY: readonly (keyof BoxData)[] = ["linkLook", "clip"];
export const CLASS_ONLY: readonly (keyof BoxData)[] = ["abstract", "attrs", "ops"];
export const EDGE_FIELDS = {
  id: ID, from: ID, to: ID, arrow: oneOf(ARROWS), startHead: oneOf(HEADS), endHead: oneOf(HEADS), dash: oneOf(DASHES), route: oneOf(ROUTES),
  exitAt: FRAC, enterAt: FRAC, via: NUMS, caption: STR, captionAt: FRAC, captionOffset: NUM, fromMember: TEXT, toMember: TEXT,
} as const satisfies Record<keyof Required<EdgeData>, Rule>;
export const ATTR_FIELDS = { name: TEXT, type: STR, access: oneOf(ACCESSES), static: BOOL } as const satisfies Record<keyof Required<ClassAttr>, Rule>;
export const OP_FIELDS = { ...ATTR_FIELDS, params: STR, abstract: BOOL } as const satisfies Record<keyof Required<ClassOp>, Rule>;
export const TOP_FIELDS = { world: OBJ, pages: LIST, nodes: LIST, edges: LIST, removed: LIST } as const satisfies Record<keyof Required<Diagram>, Rule>;

// 場所の名前（誤りの文の「どこに置けるか」の案内に使う）と表
const PLACES: { name: string; fields: Record<string, Rule> }[] = [
  { name: "world", fields: WORLD_FIELDS }, { name: t("ページ"), fields: PAGE_FIELDS }, { name: t("箱"), fields: BOX_FIELDS },
  { name: t("線"), fields: EDGE_FIELDS }, { name: t("ファイルの最上位"), fields: TOP_FIELDS },
];

// 表に無い項目の誤りの文。ほかの場所に置ける項目ならその場所を、近い名前の項目があればその名前を添える
function unknownKey(key: string, place: string, where: unknown, fields: Record<string, Rule>): string {
  const elsewhere = PLACES.filter(p => p.name !== place && Object.hasOwn(p.fields, key)).map(p => p.name);
  const near = Object.keys(fields).find(k => k !== key && closeName(k, key));
  const hint = elsewhere.length ? t("（{places} に書きます）", { places: elsewhere.join(t("・")) })
    : near ? t("（{near} のことですか）", { near }) : "";
  return t("{key} は「{place}」には書けません: {where}", { key, place, where }) + hint;
}
// 大文字小文字を無視して、1 文字の違い（足す・消す・替える）までを近い名前とする
function closeName(a: string, b: string): boolean {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  if (x === y) return true;
  if (Math.abs(x.length - y.length) > 1) return false;
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  return x.slice(i + (x.length >= y.length ? 1 : 0)) === y.slice(i + (y.length >= x.length ? 1 : 0));
}
const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

// 値の誤りの文
function badValue(key: string, rule: Rule, v: unknown, where: unknown): string {
  return t("{key} に使えるのは {expect} です: {where} ({value})", { key, expect: rule.expect, where, value: show(v) }) + (rule.hint?.(v) ?? "");
}

// o の項目を表で調べ、誤りの文を返す。only は書ける項目をさらに絞る（無ければ表の全部）。null の項目は無いのと同じに扱う
function fieldProblems(o: Record<string, unknown>, place: string, fields: Record<string, Rule>, where: unknown, opt: { theme: boolean }, deny: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (!Object.hasOwn(fields, k) || deny.includes(k)) { out.push(deny.includes(k) ? denied(k, place, where) : unknownKey(k, place, where, fields)); continue; }
    if (v == null) continue;
    if (!fields[k]!.ok(v, opt)) out.push(badValue(k, fields[k]!, v, where));
  }
  return out;
}
// 場所の表にはあるが、この箱・このページでは書けない項目
function denied(key: string, place: string, where: unknown): string {
  if (includes(WINDOW_ONLY, key)) return t("{key} はリンクの箱（link か book のある箱）にだけ書けます: {where}", { key, where });
  if (includes(CLASS_ONLY, key)) return t("{key} はクラスの箱（shape: class）にだけ書けます: {where}", { key, where });
  if (includes(BOOK_WORLD_ONLY, key)) return t("{key} はブック全体の world にだけ書けます（ページの world には書けません）: {where}", { key, where });
  return t("{key} は「{place}」には書けません: {where}", { key, place, where });
}

// 画面の変更（graph.update の patch）の値を確かめる。最初の誤りで例外。表に無い項目は見ない（patch の項目は型で決まっている）
export function checkSettings(s: Record<string, unknown>, where: unknown, world = false): void {
  const fields: Record<string, Rule> = world ? WORLD_FIELDS : BOX_FIELDS;
  for (const [k, v] of Object.entries(s)) {
    if (v == null || !Object.hasOwn(fields, k)) continue;
    if (!fields[k]!.ok(v, { theme: true })) throw new Error(badValue(k, fields[k]!, v, where));
  }
}

// id の無いボックスに連番を振る（既存の数値 id の続きから。消したボックスの id も使用済みとして数える）
export function assignIds(data: unknown): void {
  if (!isObject(data) || !Array.isArray(data.nodes)) return;
  const nodes: unknown[] = data.nodes;
  let next = nextBoxId({ nodes, removed: Array.isArray(data.removed) ? data.removed : [] }, false);
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
// theme が false なら、知らないテーマの名前は誤りにしない。項目と値は表（WORLD_FIELDS など）で、箱どうしの関係はここで調べる
function inspect(data: unknown, fail: (message: string) => void, theme: boolean): void {
  if (!isObject(data) || !Array.isArray(data.nodes)) return fail(t("nodes 配列がありません"));
  const opt = { theme };
  fieldProblems(data, t("ファイルの最上位"), TOP_FIELDS, t("ファイル"), opt).forEach(fail);
  if (isObject(data.world)) fieldProblems(data.world, "world", WORLD_FIELDS, "world", opt).forEach(fail);
  const byId = new Map<string, Record<string, unknown>>();
  for (const n of data.nodes as unknown[]) {
    if (!isObject(n) || n.id == null) { fail(t("空のノードがあります")); continue; }
    if (byId.has(String(n.id))) { fail(t("id が重複しています: {id}", { id: n.id })); continue; }
    byId.set(String(n.id), n);
    boxProblems(n, n.id, opt).forEach(fail);
  }
  // 消したボックス。id は nodes と重ならないこと（parent は消したボックスや、もう無い id でもよい）
  const removedIds = new Set<string>();
  for (const n of (Array.isArray(data.removed) ? data.removed : []) as unknown[]) {
    if (!isObject(n) || n.id == null) { fail(t("removed に空のノードがあります")); continue; }
    if (byId.has(String(n.id)) || removedIds.has(String(n.id))) { fail(t("id が重複しています: {id}", { id: n.id })); continue; }
    removedIds.add(String(n.id));
    boxProblems(n, t("消した箱 {id}", { id: n.id }), opt).forEach(fail);
  }
  for (const n of byId.values()) {
    if (n.parent == null || !ID.ok(n.parent, opt)) continue; // 値の誤りは表で知らせている
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
  // ページ（pages。2026-10-12 ユーザー: ページはブックの子。docs/TABS-plan.md）: id が重ならず、world はワールドの設定（ブック全体の項目は書けない）。
  // 箱の page はそのページの id で、最上位の箱にだけ書く
  const pages = new Map<string, Record<string, unknown>>();
  for (const p of (Array.isArray(data.pages) ? data.pages : []) as unknown[]) {
    if (!isObject(p) || p.id == null) { fail(t("pages に id の無いページがあります")); continue; }
    if (pages.has(String(p.id))) { fail(t("ページの id が重複しています: {id}", { id: p.id })); continue; }
    pages.set(String(p.id), p);
    fieldProblems(p, t("ページ"), PAGE_FIELDS, t("ページ {id}", { id: p.id }), opt).forEach(fail);
    if (isObject(p.world)) fieldProblems(p.world, "world", WORLD_FIELDS, t("ページ {id} の world", { id: p.id }), opt, BOOK_WORLD_ONLY).forEach(fail);
  }
  for (const n of byId.values()) {
    if (n.page == null || !ID.ok(n.page, opt)) continue;
    if (!pages.has(String(n.page))) { fail(t("存在しないページです: {id} → {page}", { id: n.id, page: n.page })); continue; }
    if (n.parent != null) fail(t("page は最上位の箱にだけ書けます（中の箱は親と同じページに載ります）: {id}", { id: n.id }));
  }
  // ファイルの形式（PAGE_FORMATS。D26 の段階 2）: マスターのパターンは最初のページにだけ書け、マスター用のファイルにする。
  // マスター用のファイルは 2 枚目からのページを持たない
  const format = formatOf(data as { world?: { childView?: unknown } });
  for (const p of pages.values()) {
    if (isObject(p.world) && isPattern(p.world.childView) && PAGE_FORMATS[p.world.childView] !== "book") {
      fail(t("{pattern} のパターンはページには書けません（マスター用のファイルの最初のページだけ）: {id}", { pattern: p.world.childView, id: p.id }));
    }
  }
  if (!FORMAT_RULES[format].pages && pages.size) fail(t("マスター用のファイルは 2 枚目からのページを持てません"));
  // 窓（リンクの箱・ブックの窓。link-box.ts）: link は存在するページの id で、自分の載っているページではない。子を持てない
  const hasKids = new Set([...byId.values()].filter(n => n.parent != null).map(n => String(n.parent)));
  for (const n of byId.values()) {
    if (n.book != null && n.link != null) fail(t("book と link は一緒に書けません: {id}", { id: n.id }));
    if (n.book != null && hasKids.has(String(n.id))) fail(t("ブックの窓は子を持てません: {id}", { id: n.id }));
    // 縮図を出さない見せ方（icon。D29）は、文字だけがリンク先を示すので、キャプションが要る
    if ((n.link != null || n.book != null) && n.linkLook === "icon" && !(typeof n.caption === "string" && n.caption.trim())) {
      fail(t("縮図を出さないリンクの箱には、キャプションを書いてください: {id}", { id: n.id }));
    }
    if (n.link == null || !ID.ok(n.link, opt)) continue;
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
  const edgeIds = new Set<string>();
  for (const e of (Array.isArray(data.edges) ? data.edges : []) as unknown[]) {
    if (!isObject(e) && !Array.isArray(e)) { fail(t("空の線があります")); continue; }
    const { id, from, to } = normalizeEdge(e as EdgeData | [Id, Id]);
    if (!byId.has(String(from)) || !byId.has(String(to))) { fail(t("存在しないノードへの線があります: {from} - {to}", { from, to })); continue; }
    if (isObject(e)) fieldProblems(e, t("線"), EDGE_FIELDS, `${from} - ${to}`, opt).forEach(fail);
    for (const [key, end] of [["fromMember", from], ["toMember", to]] as const) {
      const m = isObject(e) ? e[key] : undefined;
      if (typeof m !== "string" || !m) continue; // 値の誤りは表で知らせている
      const box = byId.get(String(end))!;
      if (!isClassBox(box)) fail(t("{key} はクラスの箱の端にだけ書けます: {from} - {to}", { key, from, to }));
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

// クラスの箱か（属性と操作を持つ形。形の表 SHAPE_DEFS の土台の決め方で引く）
const isClassBox = (n: Record<string, unknown>) => SHAPE_DEFS[n.shape as Shape]?.base === "class";

// 箱（と消した箱）の項目。窓の項目は窓（link か book のある箱）だけ、クラスの項目はクラスの箱だけ。クラスの属性・操作の行も表で調べる
function boxProblems(n: Record<string, unknown>, where: unknown, opt: { theme: boolean }): string[] {
  const deny = [...(n.link == null && n.book == null ? WINDOW_ONLY : []), ...(isClassBox(n) ? [] : CLASS_ONLY)];
  return [...fieldProblems(n, t("箱"), BOX_FIELDS, where, opt, deny), ...(isClassBox(n) ? classProblems(n, opt) : [])];
}

// クラスの箱の属性・操作の行（docs/CLASS-plan.md）。名前は属性と操作を通して重ねられない
function classProblems(n: Record<string, unknown>, opt: { theme: boolean }): string[] {
  const out: string[] = [];
  const names = new Set<string>();
  for (const [key, fields, place] of [["attrs", ATTR_FIELDS, t("属性")], ["ops", OP_FIELDS, t("操作")]] as const) {
    if (!Array.isArray(n[key])) continue; // 配列でなければ表で知らせている
    for (const m of n[key] as unknown[]) {
      if (!isObject(m) || typeof m.name !== "string" || !m.name) { out.push(t("{key} に名前の無い行があります: {id}", { key, id: n.id })); continue; }
      out.push(...fieldProblems(m, place, fields, t("{id} の {name}", { id: n.id, name: m.name }), opt));
      if (names.has(m.name)) out.push(t("属性・操作の名前が重なっています: {id} の {name}", { id: n.id, name: m.name }));
      names.add(m.name);
    }
  }
  return out;
}
