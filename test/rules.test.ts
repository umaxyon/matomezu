// 実装ルール（CLAUDE.md の「並べ方の戦略」）を見張る
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dir, "../web/src");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));

// 並べ方の名前を直接比べる判定は、model.ts の戦略の表（STRATEGIES）から引く。表の外に書いてよいのは、戦略に固有の描画・操作と、
// 名前がたまたま同じ別のものだけ。ファイルごとの数は今の数が上限で、増えたら表から引けないか考える（増やすなら理由をここに書く）
const ALLOWED: Record<string, number> = {
  "model.ts": Infinity,          // 戦略の表そのもの
  "render.ts": 5,                // ツリーの線と枠、非表示の ▼ と子を隠す（戦略に固有の描画）
  "panel-info.ts": 1,            // ツリーの向きの操作（戦略に固有の操作）
  "preview-art.ts": 2,           // 非表示と縮図の箱は塗る（折りたたみの描画。ミニマップとリンクの箱の窓の絵）
  "layout/layout.ts": 4,         // 並べ方の種類（KINDS）の名前で、配置の細かい決まりを分ける
  "panel.ts": 2,                 // サイドバーのタブの名前 "list"（戦略とは関係が無い）
  "validate.ts": 4,              // ページのパターンの検査（フローチャートの箱は子を持たない、ツリーは根の子孫だけ、根の有無、箱に tree を書いたときの直し方。DOM なしの CLI でも動かすので、表を読まない）
};
const COMPARE = /[!=]==\s*"(nest|tree|list|hidden|flow|master|preview)"/g;

// 形の決まりは形の表（shapes.ts の SHAPE_DEFS）から引く。形の名前を直接比べてよいのは、クラスの行の操作と編集（属性・操作の編集、
// クラスにする・やめるときの確かめ、行に線をつなぐ）だけ。ファイルごとの数は今の数が上限（増やすなら理由をここに書く）
const SHAPE_ALLOWED: Record<string, number> = {
  "shapes.ts": Infinity,  // 形の表そのもの
  "edit-dialog.ts": 8,    // クラスの属性・操作の編集と、クラスにする・やめるときの確かめ
  "panel-info.ts": 3,     // クラスの案内と、クラスにかかわる形の変更の確かめ
  "edits.ts": 1,          // クラスにする・やめるときのデータの直し
  "edge-drag.ts": 1,      // 線の端をクラスの行へつなぐ
  "validate.ts": 1,       // fromMember / toMember はクラスの端にだけ書ける
};
const SHAPE_COMPARE = /shape\w*(\([^)]*\))?(\.\w+)?\s*[!=]==\s*"(box|person|db|diamond|server|class|circle|stadium|hexagon|parallelogram|parallelogramAlt|trapezoid|trapezoidAlt)"/g;

test("形の名前を直接比べる判定を、形の表の外に増やさない", () => {
  const over: string[] = [];
  for (const f of files(SRC)) {
    const name = relative(SRC, f).replaceAll("\\", "/");
    const count = (readFileSync(f, "utf8").match(SHAPE_COMPARE) ?? []).length;
    if (count > (SHAPE_ALLOWED[name] ?? 0)) over.push(`${name}: ${count}（上限 ${SHAPE_ALLOWED[name] ?? 0}）`);
  }
  expect(over).toEqual([]);
});

// 全世界のルールを変えられるのは、並べ方の戦略のローカルなルールだけ（CLAUDE.md の 12）。間隔のルールの名前を読んでよいファイルと数:
// 置き場所（graph.ts の DEFAULTS）、戦略の表（model.ts）、入口（layout.ts の gapBetween）、リストの並べ方（node-kinds.ts。戦略が自分の子を並べる所）
const GAP_RULES = /\b(linkGap|captionGap|kidGap|pairGaps)\b/g;
const GAP_ALLOWED: Record<string, number> = { "graph.ts": 2, "model.ts": Infinity, "layout/layout.ts": 6, "layout/node-kinds.ts": 1 };
// 全世界の間隔そのもの（opt.gap）を直接使ってよいのは、入口（gapBetween と、格子の目の最小）、リストの並べ方、付け替えのときと
// 貼り付けで隣に置くとき（D23）の置き場所の見込み（そのあと gapBetween で重なりを直す）だけ
const BASE_GAP = /opt\.gap\b/g;
const BASE_ALLOWED: Record<string, number> = { "layout/layout.ts": 4, "layout/node-kinds.ts": 1, "graph.ts": 2 };

test("全世界のルール（間隔）を読むのは、置き場所・戦略の表・入口だけ。部品（形・テーマ）は間隔や配置の値を持たない", () => {
  const over: string[] = [];
  for (const f of files(SRC)) {
    const name = relative(SRC, f).replaceAll("\\", "/");
    const src = readFileSync(f, "utf8").split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n"); // コメントは数えない
    const rules = (src.match(GAP_RULES) ?? []).length, base = (src.match(BASE_GAP) ?? []).length;
    if (rules > (GAP_ALLOWED[name] ?? 0)) over.push(`${name}: 間隔のルール ${rules}（上限 ${GAP_ALLOWED[name] ?? 0}）`);
    if (base > (BASE_ALLOWED[name] ?? 0)) over.push(`${name}: opt.gap ${base}（上限 ${BASE_ALLOWED[name] ?? 0}）`);
  }
  expect(over).toEqual([]);
  // 部品の表（形・テーマ）は、間隔や配置の値を持たない（持つのは自分の見た目の数値だけ）
  for (const part of ["shapes.ts", "theme.ts"]) {
    expect(readFileSync(join(SRC, part), "utf8")).not.toMatch(/\b(gap|Gap|align|margin)\b\s*[:?]/);
  }
});

// 配置と線の計算は、見た目（テーマ）の値を読まない（CLAUDE.md の 9）。読むのは測った大きさと線がつながる範囲だけ
test("配置と線のファイルは、テーマを読み込まない", () => {
  const geometry = files(SRC).filter(f => {
    const name = relative(SRC, f).replaceAll("\\", "/");
    return name.startsWith("layout/") || ["routing.ts", "selfloop.ts", "geom.ts"].includes(name);
  });
  const bad = geometry.filter(f => /from\s+"[./]+\/theme"/.test(readFileSync(f, "utf8"))).map(f => relative(SRC, f));
  expect(geometry.length).toBeGreaterThan(5);
  expect(bad).toEqual([]);
});

test("並べ方の名前を直接比べる判定を、戦略の表の外に増やさない", () => {
  const over: string[] = [];
  for (const f of files(SRC)) {
    const name = relative(SRC, f).replaceAll("\\", "/");
    const count = (readFileSync(f, "utf8").match(COMPARE) ?? []).length;
    if (count > (ALLOWED[name] ?? 0)) over.push(`${name}: ${count}（上限 ${ALLOWED[name] ?? 0}）`);
  }
  expect(over).toEqual([]);
});

// 大きさの決まりの層（D44。docs/BOX-SIZE-plan.md の 6.1）: 段（S・M・L）の値を持つのは size-rules.ts（ふつうの形のローカルな段の表）だけ。
// 大きさを測る所・描く所は、層を当てた決まり（sizeRuleOf）を読み、段の名前で比べない。ほかに段の名前を比べてよいのは、
// データの既定（書かれていなければ M。既定なら書かない）だけ。ファイルごとの数は今の数が上限（増やすなら理由をここに書く）
const STEP_ALLOWED: Record<string, number> = {
  "size-rules.ts": Infinity, // 段の表そのもの
  "graph.ts": 1,             // リストの高さ（rowSize）が既定の M なら書かない
  "edit-dialog.ts": 1,       // 足す箱のサイズが既定の M なら書かない
};
const STEP_COMPARE = /[!=]==\s*"(L|M|S)"/g;
// 段の値の表を読み込む所（size-rules.ts の STEPS。validate.ts の SIZES はデータの検査の名前だけ）
const STEP_TABLES = /import[^;]*\b(SIZES|STEPS)\b[^;]*from "[./]*\/?(size-rules|validate)"/g;

test("段（S・M・L）の名前を比べる判定と、段の値の表を読む所を、size-rules.ts の外に増やさない（D44）", () => {
  const over: string[] = [];
  for (const f of files(SRC)) {
    const name = relative(SRC, f).replaceAll("\\", "/");
    const src = readFileSync(f, "utf8").split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n"); // コメントは数えない
    const count = (src.match(STEP_COMPARE) ?? []).length;
    if (count > (STEP_ALLOWED[name] ?? 0)) over.push(`${name}: 段の名前の比較 ${count}（上限 ${STEP_ALLOWED[name] ?? 0}）`);
    if (name !== "size-rules.ts" && name !== "validate.ts" && STEP_TABLES.test(src)) over.push(`${name}: 段の値の表を読んでいる`);
    STEP_TABLES.lastIndex = 0;
  }
  expect(over).toEqual([]);
});

// 本来いたい位置（intendedX・intendedY）と、土台が最後に並べ終えた位置（placedX・placedY）を書き換えるのは、配置の土台（layout/）だけ
// （D48。2026-10-19 ユーザー: 土台を固める）。操作の側は箱を動かすだけで、土台が並べ直すときに決める（layout.ts の adoptMoved）。
// 土台の外で書いてよいのは、箱を作るときの初めの値（graph.ts の buildNode）だけ
test("本来いたい位置を書き換えるのは配置の土台だけ", () => {
  const WRITE = /\b(intended|placed)[XY]\s*[+-]?=(?!=)|\[[^\]]*\.(intended|placed)[XY][^\]]*\]\s*=(?!=)/g;
  const BUILD = /^\s*(intended|placed)[XY]: /gm; // 箱を作るときの初めの値（オブジェクトの項目）
  const over: string[] = [];
  for (const f of files(SRC)) {
    const name = relative(SRC, f).replaceAll("\\", "/");
    if (name.startsWith("layout/")) continue;
    const text = readFileSync(f, "utf8").replace(BUILD, "");
    const hits = text.match(WRITE) ?? [];
    if (hits.length) over.push(`${name}: ${hits.join(" / ")}`);
  }
  expect(over).toEqual([]);
});
