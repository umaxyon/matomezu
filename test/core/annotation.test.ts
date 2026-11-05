// アノテーション（core/annotation.ts）: 種類が無い・形が合わない物は、その 1 つだけ効かず warning になり、ほかのアノテーションは変えられる
import { expect, test } from "bun:test"
import { type Annotation, annotationsForAi, checkAnnotations, prune, unexpired } from "../../web/src/core/annotation"
import { performIn } from "../../web/src/core/perform"
import type { Book } from "../../web/src/core/schema/book"
import { warningText } from "../../web/src/core/warnings"
import { CORE_CATALOG } from "../support"

const book = {
  type: "@matomezu/drawing:drawing",
  id: "d",
  title: "D",
  pages: [
    {
      id: "p",
      title: "P",
      paper: "@matomezu/base:a4",
      orientation: "portrait",
      items: [{ id: "a", item: "@matomezu/box:shape-nest-box", x: 0, y: 0, w: 64, h: 64, props: { caption: "A" } }],
    },
  ],
} as unknown as Book

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
  expect(checkAnnotations(CORE_CATALOG, book, [GOOD, BAD, GONE]).map(warningText)).toEqual([
    "W019 @matomezu/base: book d (D): annotation c2 does not fit @matomezu/base:note (kept as it is, not used)",
    "W018 @ex/notes: book d (D): annotation c3 is a @ex/notes:sticky, which is not in the catalog (kept as it is, not used)",
  ])
})

test("効かないアノテーションがあっても、ほかのアノテーションは変えられ、効かない物はそのまま残る", () => {
  const world = { books: { d: book }, settings: {}, annotations: { d: [GOOD, BAD, GONE] } }
  const done = performIn(
    world,
    "@matomezu/base:note-remove",
    { note: "c1" },
    { book: "d" },
    {
      catalog: CORE_CATALOG,
      home: null,
      lang: "en",
      newId: () => "n",
      now: "2026-11-01T00:00:00.000Z",
    },
  )
  expect(done).toMatchObject({ ok: true, annotations: { d: [BAD, GONE] } })
})

test("prune は無くなった物をアンカーから外し、全部無くなった物を消す。変わらなければ同じ並び", () => {
  const list = [GOOD, { ...GOOD, id: "c4", anchors: ["a", "x"] }, { ...GOOD, id: "c5", anchors: ["x"] }]
  expect(prune(list, book).map(a => [a.id, a.anchors])).toEqual([
    ["c1", ["a"]],
    ["c4", ["a"]],
  ])
  const same = [GOOD]
  expect(prune(same, book)).toBe(same)
})

test("AI に見せるアノテーションは、結び付く物の最後のあるページと、AI の応えを待っているか（種類の awaits。形が合わない物と種類の無い物は待たない）を添える", () => {
  const read = note("c4", { text: "x", bubble: true, addedAt: "t", readAt: "t" })
  const unread = note("c5", { text: "見て", bubble: false, addedAt: "t" })
  expect(
    annotationsForAi(CORE_CATALOG, book, [GOOD, read, unread, BAD, GONE]).map(a => [a.id, a.page, a.awaits]),
  ).toEqual([
    ["c1", "p", true],
    ["c4", "p", false],
    ["c5", "p", true],
    ["c2", "p", false],
    ["c3", "p", false],
  ])
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
