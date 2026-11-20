// アノテーション（core/annotation.ts）: 種類が無い・形が合わない物は、その 1 つだけ効かず warning になり、ほかのアノテーションは変えられる

import { expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import {
  type Annotation,
  annotationBriefs,
  annotationsForAi,
  checkAnnotations,
  prune,
  unexpired,
} from "../../web/src/core/annotation"
import { findPage } from "../../web/src/core/book"
import { tablesOf } from "../../web/src/core/folders"
import { performIn } from "../../web/src/core/perform-world"
import { warningText } from "../../web/src/core/warnings"
import { drawingPage, FLOWCHART, testBook, testPage } from "../lineup"
import { CORE_CATALOG } from "../support"

const book = testBook("d", "D", [
  drawingPage("p", {
    title: "P",
    orientation: "portrait",
    items: [{ id: "a", item: "@matomezu/box:shape-nest-box", x: 0, y: 0, w: 64, h: 64, props: { caption: "A" } }],
  }),
])

const page = findPage(book, "p")!.page

const note = (id: string, props: unknown): Annotation => ({
  id,
  annotation: "@matomezu/base:note",
  anchors: ["a"],
  props,
})
const GOOD = note("c1", { text: "x", bubble: true, addedAt: "t" })
const BAD = note("c2", { ask: "later" })
const GONE: Annotation = { id: "c3", annotation: "@ex/notes:sticky", anchors: ["a"], props: {} }

test("種類が機能台帳に無い物は W018、形が合わない物は W019 になる（データには手を付けない）", () => {
  expect(checkAnnotations(CORE_CATALOG, book, page, [GOOD, BAD, GONE]).map(warningText)).toEqual([
    "W019 @matomezu/base: book d (D): annotation c2 does not fit @matomezu/base:note (kept as it is, not used)",
    "W018 @ex/notes: book d (D): annotation c3 is a @ex/notes:sticky, which is not in the catalog (kept as it is, not used)",
  ])
})

test("効かないアノテーションがあっても、ほかのアノテーションは変えられ、効かない物はそのまま残る", () => {
  const world = {
    ...tablesOf([book]),
    settings: {},
    annotations: { p: [GOOD, BAD, GONE] },
    participants: [],
    records: {},
    counters: {},
  }
  const done = performIn(
    world,
    "@matomezu/base:note-remove",
    { note: "c1" },
    { page: "p" },
    {
      catalog: CORE_CATALOG,
      controlCenter: null,
      lang: "en",
      newId: () => "n",
      now: "2026-11-01T00:00:00.000Z",
      today: "2026-11-01",
      actor: USER,
    },
  )
  expect(done).toMatchObject({ ok: true, annotations: { p: [BAD, GONE] } })
})

test("prune は無くなった物をアンカーから外し、全部無くなった物を消す。変わらなければ同じ並び", () => {
  const list = [GOOD, { ...GOOD, id: "c4", anchors: ["a", "x"] }, { ...GOOD, id: "c5", anchors: ["x"] }]
  expect(prune(list, page).map(a => [a.id, a.anchors])).toEqual([
    ["c1", ["a"]],
    ["c4", ["a"]],
  ])
  const same = [GOOD]
  expect(prune(same, page)).toBe(same)
})

test("prune は anchors の形が壊れた物を消さずに残す（形の確かめは別の所で行う）", () => {
  const broken = { ...GOOD, id: "c6", anchors: "a" } as unknown as typeof GOOD
  expect(prune([broken], page)).toEqual([broken])
})

test("AI に見せるアノテーションは、付いているページと、AI の応えを待っているか（種類の awaits。形が合わない物と種類の無い物は待たない）を添える", () => {
  const read = note("c4", { text: "x", bubble: true, addedAt: "t", readAt: "t" })
  const unread = note("c5", { text: "見て", bubble: false, addedAt: "t" })
  expect(
    annotationsForAi(CORE_CATALOG, page, [GOOD, read, unread, BAD, GONE]).map(a => [a.id, a.page, a.awaits]),
  ).toEqual([
    ["c1", "p", true],
    ["c4", "p", false],
    ["c5", "p", true],
    ["c2", "p", false],
    ["c3", "p", false],
  ])
})

test("AI に知らせる 1 行は、種類の aiBrief を、改行と続く空白を 1 つの空白にして 40 字で切り、切れたら全体の字数を添える。aiBrief の無い種類・形が合わない物・種類の無い物には付けない", () => {
  const long = note("c6", { text: `${"あ".repeat(30)}\n\n${"い".repeat(30)}`, bubble: true, addedAt: "t" })
  const mark: Annotation = {
    id: "m1",
    annotation: "@matomezu/base:mark",
    anchors: ["a"],
    props: { kind: "suzume", addedAt: "t" },
  }
  expect(annotationBriefs(CORE_CATALOG, page, [GOOD, long, mark, BAD, GONE])).toEqual({
    c1: "x",
    c6: `${"あ".repeat(30)} ${"い".repeat(9)}… (61 chars)`,
    m1: "suzume",
  })
})

test("伝言は、会話の時点から伝言期限（利用者の設定。既定 60 分）が過ぎると残らない。消さないの設定、会話の時点の無い物、直している物は残る", () => {
  const talked = note("c6", {
    text: "x",
    bubble: true,
    addedAt: "t",
    readAt: "t",
    talkedAt: "2026-11-05T00:00:00.000Z",
  })
  const quiet = note("c7", { text: "x", bubble: true, addedAt: "t", readAt: "t" })
  const list = [talked, quiet]
  expect(unexpired(CORE_CATALOG, list, {}, "2026-11-05T00:59:00.000Z")).toBe(list)
  expect(unexpired(CORE_CATALOG, list, {}, "2026-11-05T01:01:00.000Z").map(a => a.id)).toEqual(["c7"])
  expect(unexpired(CORE_CATALOG, list, { "@matomezu/base:note-expiry": "never" }, "2026-11-06T00:00:00.000Z")).toBe(
    list,
  )
  expect(unexpired(CORE_CATALOG, list, {}, "2026-11-05T01:01:00.000Z", new Set(["c6"]))).toBe(list)
  expect(
    unexpired(CORE_CATALOG, list, { "@matomezu/base:note-expiry": "0" }, "2026-11-05T00:00:01.000Z").map(a => a.id),
  ).toEqual(["c7"])
})

test("タイプの混ざるブックでは、付いているページのタイプで使えるかが決まる。ほかのページの物には結び付けられない", () => {
  const flowchart = CORE_CATALOG.pageTypes.get(FLOWCHART)!
  const catalog = {
    ...CORE_CATALOG,
    pageTypes: new Map([
      ...CORE_CATALOG.pageTypes,
      [FLOWCHART, { ...flowchart, annotations: { without: ["@matomezu/base:note"] } }],
    ]),
  } as typeof CORE_CATALOG
  const box = (id: string) => ({ id, item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: { caption: id } })
  const mixed = testBook("m", "混ざる", [
    drawingPage("p1", { items: [box("a")] }),
    testPage(FLOWCHART, "p2", { title: "流れ", items: [box("b")] }),
  ])
  const on = (id: string, anchors: string[]): Annotation => ({ ...GOOD, id, anchors })
  const codes = (at: string, a: Annotation) =>
    checkAnnotations(catalog, mixed, findPage(mixed, at)!.page, [a]).map(w => w.code)
  expect(codes("p1", on("n1", ["a"]))).toEqual([])
  expect(codes("p2", on("n2", ["b"]))).toEqual(["W019"])
  expect(codes("p1", on("n3", ["a", "b"]))).toEqual(["W019"])
})
