// データのスキーマ（validate.ts の表。2026-10-17 ユーザー: データの形は型で決め、表に無い項目は誤り）。
// 表と型が一致することはビルド（satisfies）が見張るので、ここでは表から回して「正しい値は通り、正しくない値と表に無い項目は誤り」を確かめる。
// 項目ごとの値の境目を 1 つずつ書いたテストは、ここにまとめた（見本は表の決まり Rule の good・bad）
import { describe, expect, test } from "bun:test";
import type { Diagram } from "../web/src/types";
import {
  ATTR_FIELDS, BOOK_WORLD_ONLY, BOX_FIELDS, CLASS_ONLY, EDGE_FIELDS, OP_FIELDS, PAGE_FIELDS, type Rule, TOP_FIELDS, WINDOW_ONLY, WORLD_FIELDS,
  checkSettings, problems, validate,
} from "../web/src/validate";

// 1 つの項目だけを書いた、ほかに誤りの無い図。項目の場所ごとに、その項目が効くのに要る相手（リンク先のページ・クラスの形など）も置く
type Place = { name: string; fields: Record<string, Rule>; data(key: string, value: unknown): Diagram; skip?: readonly string[] };
const PLACES: Place[] = [
  {
    name: "最初のページの world", fields: WORLD_FIELDS,
    // root はツリーの根（そのページの最上位の箱）なので、決まりの見本ではなく関係の検査で確かめる（validate-matrix.test.ts）
    data: (k, v) => ({ world: { [k]: v }, nodes: [{ id: 1 }] }), skip: ["root", "childView"],
  },
  {
    name: "ページの world", fields: WORLD_FIELDS,
    data: (k, v) => ({ pages: [{ id: "p2", world: { [k]: v } }], nodes: [{ id: 1, page: "p2" }] }), skip: ["root", "childView", ...BOOK_WORLD_ONLY],
  },
  { name: "ページ", fields: PAGE_FIELDS, data: (k, v) => ({ pages: [{ id: "p2", [k]: v }], nodes: [] }), skip: ["id", "world"] },
  {
    name: "箱", fields: BOX_FIELDS,
    // 窓の項目は窓の箱に、クラスの項目はクラスの箱に書く。関係を見る項目（id・parent・page・link）は validate-matrix.test.ts
    data: (k, v) => ({
      pages: [{ id: "p2" }],
      nodes: [{ id: 1, ...(WINDOW_ONLY.includes(k as never) ? { link: "p2", caption: "窓" } : {}), ...(CLASS_ONLY.includes(k as never) ? { shape: "class" as const } : {}), [k]: v }],
    }),
    skip: ["id", "parent", "page", "link"],
  },
  {
    name: "線", fields: EDGE_FIELDS,
    data: (k, v) => ({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2, [k]: v }] }), skip: ["from", "to", "fromMember", "toMember", "id"],
  },
  {
    name: "クラスの属性", fields: ATTR_FIELDS,
    data: (k, v) => ({ nodes: [{ id: 1, shape: "class", attrs: [{ name: "a", [k]: v }] }] }), skip: ["name"],
  },
  {
    name: "クラスの操作", fields: OP_FIELDS,
    data: (k, v) => ({ nodes: [{ id: 1, shape: "class", ops: [{ name: "f", [k]: v }] }] }), skip: ["name"],
  },
];

describe.each(PLACES)("$name", ({ fields, data, skip = [] }) => {
  const keys = Object.keys(fields).filter(k => !skip.includes(k));
  test.each(keys)("%s: 見本の正しい値は通り、正しくない値は「使えるのは …」の誤り", key => {
    const rule = fields[key]!;
    for (const v of rule.good) expect([key, v, problems(data(key, v))]).toEqual([key, v, []]);
    for (const v of rule.bad) {
      const got = problems(data(key, v));
      expect([key, v, got.length]).toEqual([key, v, 1]);
      expect(got[0]).toContain(`${key} に使えるのは ${rule.expect} です`);
    }
  });
  test("表に無い項目は誤り（近い名前の項目があれば添える）", () => {
    const got = problems(data("noSuchKey", 1));
    expect(got).toHaveLength(1);
    expect(got[0]).toContain("noSuchKey は");
    expect(got[0]).toContain("」には書けません");
    const near = keys.find(k => k.length > 3)!;
    expect(problems(data(near + "x", fields[near]!.good[0]))[0]).toContain(`（${near} のことですか）`);
  });
});

test("ファイルの最上位も表（TOP_FIELDS）に無い項目は誤り", () => {
  expect(Object.keys(TOP_FIELDS).sort()).toEqual(["edges", "nodes", "pages", "removed", "world"]);
  expect(problems({ nodes: [], version: 2 })).toEqual([expect.stringContaining("version は「ファイルの最上位」には書けません")]);
});

test("ほかの場所に置ける項目は、その場所を案内する（箱の kidSize・treeDirection・world は world やページへ）", () => {
  expect(problems({ nodes: [{ id: 1, kidSize: "L" }] })).toEqual([expect.stringContaining("kidSize は「箱」には書けません: 1（world に書きます）")]);
  expect(problems({ nodes: [{ id: 1, treeDirection: "left" }] })).toEqual([expect.stringContaining("（world に書きます）")]);
  expect(problems({ nodes: [{ id: 1, world: {} }] })).toEqual([expect.stringContaining("（ページ・ファイルの最上位 に書きます）")]);
  expect(problems({ nodes: [], world: { caption: "x" } })).toEqual([expect.stringContaining("caption は「world」には書けません: world（箱・線 に書きます）")]);
});

test("箱の childView にページのパターンを書くと、world.childView に書く直し方を添える", () => {
  expect(problems({ nodes: [{ id: 1, childView: "tree" }] })).toEqual([expect.stringContaining("world.childView に tree、world.root に根の箱の id を書きます")]);
  expect(problems({ nodes: [{ id: 1, childView: "flow" }] })).toEqual([expect.stringContaining("world.childView に書きます")]);
});

test("箱の種類だけが持つ項目: 窓の項目は窓の箱だけ、クラスの項目はクラスの箱だけ、ブック全体の項目はページの world に書けない", () => {
  for (const k of WINDOW_ONLY) {
    const v = BOX_FIELDS[k as keyof typeof BOX_FIELDS].good[0];
    expect(problems({ nodes: [{ id: 1, [k]: v }] })).toEqual([expect.stringContaining(`${k} はリンクの箱（link か book のある箱）にだけ書けます`)]);
    expect(problems({ nodes: [{ id: 1, book: "abc", caption: "窓", [k]: v }] })).toEqual([]); // ブックの窓にも書ける
  }
  for (const k of CLASS_ONLY) {
    const v = BOX_FIELDS[k as keyof typeof BOX_FIELDS].good[0];
    expect(problems({ nodes: [{ id: 1, [k]: v }] })).toEqual([expect.stringContaining(`${k} はクラスの箱（shape: class）にだけ書けます`)]);
  }
  for (const k of BOOK_WORLD_ONLY) {
    const v = WORLD_FIELDS[k].good[0];
    expect(problems({ pages: [{ id: "p2", world: { [k]: v } }], nodes: [] })).toEqual([expect.stringContaining(`${k} はブック全体の world にだけ書けます`)]);
  }
});

test("null の項目は無いのと同じ（誤りにしない）。消した箱も箱の表で調べる", () => {
  expect(problems({ nodes: [{ id: 1, caption: null as never, size: null as never }] })).toEqual([]);
  expect(problems({ nodes: [], removed: [{ id: 2, size: "XL" as never }] })).toEqual([expect.stringContaining("消した箱 2")]);
  expect(problems({ nodes: [], removed: [{ id: 2, memo: 1 } as never] })).toEqual([expect.stringContaining("memo は「箱」には書けません")]);
});

test("テーマ: 検査（problems）では知らない名前は誤り、画面で開く validate では誤りにしない（標準として描いて知らせる）", () => {
  expect(problems({ nodes: [{ id: 1, theme: "nope" }] })).toEqual([expect.stringContaining("theme に使えるのは")]);
  expect(() => validate({ nodes: [{ id: 1, theme: "nope" }] })).not.toThrow();
  expect(() => validate({ nodes: [{ id: 1, theme: 3 as never }] })).toThrow("theme に使えるのは");
});

test("画面の変更（checkSettings）も同じ表で値を確かめる。表に無い項目は見ない（patch の項目は型で決まっている）", () => {
  expect(() => checkSettings({ size: "XL" }, 1)).toThrow("size に使えるのは L / M / S です: 1 (XL)");
  expect(() => checkSettings({ paper: "b5" }, "world", true)).toThrow("paper に使えるのは");
  expect(() => checkSettings({ size: null, caption: "a", other: 1 }, 1)).not.toThrow();
});
