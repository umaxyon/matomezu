// 形を全部まとめて動かしたとき、線の手直し（via）は形と一緒に動く（動く量の引き算に出る浮動小数点の誤差で、片方だけ動いたとみなして消さない）。
// 位置が小数で、via を持つ線が 2 本ある図を使う

import { expect, test } from "bun:test"
import { pagesOf, restoreBooks } from "../../../web/src/core/book"
import { CANNOT_PLACE } from "../../../web/src/plugins/base"
import { moveItems } from "../../../web/src/plugins/paper/placing/items"
import { drawingPage, testBook } from "../../lineup"
import { CORE_CATALOG } from "../../support"

const S = (
  id: string,
  x: number,
  y: number,
  item: string,
  w: number,
  h: number,
  props: object,
  shapes?: unknown[],
) => ({ id, x, y, item, w, h, props, ...(shapes ? { shapes } : {}) })
const L = (id: string, from: string, to: string, props: object) => ({
  id,
  item: "@matomezu/line:connector-line",
  from,
  to,
  props,
})
const items = [
  S("eb78b10e2b", 61.9892210601479, 279.7312188917591, "@matomezu/art:shape-person", 64, 80, { caption: "ユーザー" }),
  S("cc936c0a13", 412.0644833144322, 158.37635064894158, "@matomezu/art:shape-server", 64, 80, { caption: "常駐" }),
  S("5a1930dfb5", 340.0429779380881, 428.7096839822749, "@matomezu/art:shape-robot", 106, 80, {
    caption: "main_manager",
    color: "success",
  }),
  S("63c963bb4a", 356.06448331443215, 641.7957186134913, "@matomezu/art:shape-robot", 80, 80, {
    caption: "sub1_work",
    color: "danger",
  }),
  S("7b2b814a8c", 411.70964460475477, 36.52689156481017, "@matomezu/art:shape-db", 64, 80, {
    caption: "sqlite",
    color: "#ffc400",
  }),
  S("e6a849e362", 847.6774390435988, 242.46236395066785, "@matomezu/art:shape-factory", 102, 74, {
    caption: "model(cloude)",
    color: "secondary",
  }),
  S("7cf5915423", 219.20426826066873, 161.94630875126012, "@matomezu/art:shape-pc", 77, 74, { caption: "matomezu" }),
  L("47343c42ba", "eb78b10e2b", "7cf5915423", { endHead: "arrow", exitAt: 0.3611, enterAt: 0.9076 }),
  L("e13444b0aa", "eb78b10e2b", "5a1930dfb5", { endHead: "arrow", exitAt: 0.3611, enterAt: 0.8903, via: [173] }),
  L("6dc9c52e35", "eb78b10e2b", "63c963bb4a", { endHead: "arrow", exitAt: 0.3611, enterAt: 0.8876, via: [172] }),
  L("0c248678a0", "7cf5915423", "cc936c0a13", { endHead: "arrow", exitAt: 0.3775, enterAt: 0.8603 }),
  L("dc2509c1f2", "cc936c0a13", "7b2b814a8c", {
    startHead: "arrow",
    endHead: "arrow",
    exitAt: 0.1111,
    enterAt: 0.6099,
  }),
  L("4b7f691c8e", "5a1930dfb5", "cc936c0a13", {
    startHead: "arrow",
    endHead: "arrow",
    exitAt: 0.1425,
    enterAt: 0.6076,
    via: [297],
  }),
  L("5169b64f66", "5a1930dfb5", "63c963bb4a", {
    startHead: "arrow",
    endHead: "arrow",
    exitAt: 0.6297,
    enterAt: 0.1303,
  }),
  S(
    "796ba4d819",
    518.4596577305947,
    431.2473840200773,
    "@matomezu/box:shape-nest-box",
    142,
    64,
    { caption: "mainのコンテキスト", rule: true, body: "", captionAlign: "center", bodyAlign: "left" },
    [
      S("538f2d5d3a", 33.95700237315185, 28, "@matomezu/art:shape-db", 73, 80, {
        caption: "全件データ",
        color: "#f4b8b8",
      }),
    ],
  ),
  S(
    "c585cfbc31",
    522,
    628,
    "@matomezu/box:shape-nest-box",
    142,
    64,
    { caption: "sub1のコンテキスト", rule: true, body: "", captionAlign: "center", bodyAlign: "left" },
    [S("2ecb224dac", 33, 29, "@matomezu/art:shape-db", 73, 80, { caption: "全件データ", color: "#f4b8b8" })],
  ),
  L("505bf85fae", "5a1930dfb5", "796ba4d819", { endHead: "arrow", exitAt: 0.3925, enterAt: 0.9262 }),
  L("5c03fa8cc0", "796ba4d819", "e6a849e362", { route: "straight", endHead: "arrow", exitAt: 0.3343, enterAt: 0.8846 }),
  L("db1f3eb628", "63c963bb4a", "c585cfbc31", { endHead: "arrow", exitAt: 0.375, enterAt: 0.895 }),
  L("6b14987870", "c585cfbc31", "e6a849e362", { route: "straight", endHead: "arrow", exitAt: 0.3871, enterAt: 0.7118 }),
]
test("全部を右へ動かしても、via は動いた量だけずれる（動かす量が 1〜170（紙に収まる範囲）のどれでも消えない）", () => {
  const raw = testBook("b", "t", [drawingPage("p", { title: "現在", items: items })])
  const [book] = restoreBooks(CORE_CATALOG, [raw])
  const ids = [
    "eb78b10e2b",
    "cc936c0a13",
    "5a1930dfb5",
    "63c963bb4a",
    "7b2b814a8c",
    "e6a849e362",
    "7cf5915423",
    "796ba4d819",
    "c585cfbc31",
  ]
  for (let dx = 1; dx <= 170; dx++) {
    const next = moveItems(CORE_CATALOG, pagesOf(book!)[0]!, ids, { x: dx, y: 0 })
    if (next === CANNOT_PLACE) throw new Error("動かせない")
    const items = next.items as unknown as {
      id: string
      props: { via?: number[] }
    }[]
    const via = (id: string) => items.find(i => i.id === id)?.props.via
    expect([dx, via("e13444b0aa"), via("6dc9c52e35")]).toEqual([dx, [173 + dx], [172 + dx]])
  }
})
