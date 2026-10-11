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
  "minimap.ts": 1,               // 非表示の箱は塗る（折りたたみの描画）
  "layout/layout.ts": 4,         // 並べ方の種類（KINDS）の名前で、配置の細かい決まりを分ける
  "panel.ts": 2,                 // サイドバーのタブの名前 "list"（戦略とは関係が無い）
  "validate.ts": 1,              // フローチャートの要素は子を持たない検査（DOM なしの CLI でも動かすので、表を読まない）
};
const COMPARE = /[!=]==\s*"(nest|tree|list|hidden|flow)"/g;

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
