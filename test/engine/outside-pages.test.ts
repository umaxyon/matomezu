// 常駐のエンジンが、ブックの外のページ（どのブックにも入っていないページ）の行を受けたときの読み方と、編集ロック・ずらした知らせ。
// 外のページは、テストの用意として書庫の表に直に置く（作るアクションは通さない）
import { expect, test } from "bun:test"
import "../../web/src/engine/engine"
import type { AnyPage } from "../../web/src/core/schema/book"
import { drawingPage, testBook } from "../lineup"
import { worldRows } from "../support"

const engine = globalThis as unknown as { matomezuPerform(input: string): string }
const NOW = "2026-11-20T00:00:00.000Z"
const BOX = "@matomezu/box:shape-nest-box"
const UPDATE = "@matomezu/base:page-update"
const AI = { kind: "ai", workroom: "room" }

interface Step {
  action: string
  args: unknown
  on?: unknown
  ids?: string[]
}

// ブック b1 と、書庫ホームの直下のブックの外のページ outside を置いた世界で、アクションバルク actions を行った結果
function performOn(actions: readonly Step[], more: Record<string, unknown> = {}, outside: readonly AnyPage[] = [x1()]) {
  const rows = worldRows([testBook("b1", "ブック", [drawingPage("p1")])], outside)
  return JSON.parse(
    engine.matomezuPerform(
      JSON.stringify({
        actions: actions.map(a => ({ now: NOW, ...a })),
        settings: {},
        ...rows,
        actor: { kind: "user" },
        ...more,
      }),
    ),
  )
}

// ブックの外のページ x1（箱 a を 1 つ置いた図面）
function x1(): AnyPage {
  return drawingPage("x1", {
    title: "外",
    items: [{ id: "a", item: BOX, x: 100, y: 100, props: { caption: "a", body: "" } }],
  })
}

test("ブックの外のページが在っても、書庫が対象のアクション（フォルダを作る・ブックの名前を変える）を行え、外のページの行は書き直さない", () => {
  const created = performOn([{ action: "@matomezu/base:folder-create", args: { title: "新" }, ids: ["f1"] }])
  expect(created).toMatchObject({ ok: true, created: ["f1"], pages: [] })
  const renamed = performOn([{ action: "@matomezu/base:entry-rename", args: { entry: "b1", title: "改" } }])
  expect(renamed).toMatchObject({ ok: true, books: ["b1"], pages: [] })
})

test("ブックの外のページを変えたら、そのページの行だけを返す（変わったブックは無い）", () => {
  const out = performOn([{ action: UPDATE, args: { title: "改" }, on: { page: "x1" } }])
  expect(out).toMatchObject({ ok: true, books: [], folders: [] })
  expect(out.pages.map((c: { id: string; row: { title: string } }) => [c.id, c.row.title])).toEqual([["x1", "改"]])
})

test("利用者が直しているブックの外のページを、編集ロックで断るアクション（AI のアクション）は変えない（being-edited）", () => {
  const rename = [{ action: UPDATE, args: { title: "改" }, on: { page: "x1" } }]
  expect(performOn(rename, { actor: AI, watched: { x1: ["x1"] } })).toEqual({
    ok: false,
    reason: "being-edited",
    at: 0,
  })
  expect(performOn(rename, { actor: AI, watched: { x1: ["a"] } })).toMatchObject({ ok: true })
  expect(performOn(rename, { actor: AI })).toMatchObject({ ok: true })
  // 中のアイテムを直していれば、そのアイテムを変えるアクションも断る
  const moved = [
    { action: "@matomezu/paper:item-move", args: { items: ["a"], by: { x: 10, y: 10 } }, on: { page: "x1" } },
  ]
  expect(performOn(moved, { actor: AI, watched: { x1: ["a"] } })).toMatchObject({ ok: false, reason: "being-edited" })
})

test("ブックの外の可変ページの中身をずらしたら、ブックを添えずにページだけを知らせる", () => {
  const out = performOn([{ action: UPDATE, args: { grows: "all" }, on: { page: "x1" } }])
  expect(out).toMatchObject({ ok: true })
  expect(out.notice).toBe(
    "The contents of a variable page were shifted by whole papers, so every position there changed (page x1 by 1 paper(s) right and 1 down); read_page before using positions.",
  )
})

test("ブックの外の読めないページは、名前を変える・ゴミ箱に入れる・複製する・宛先にすることができない（行は書き直さない）", () => {
  const stranger = { ...drawingPage("x1", { title: "外" }), type: "@foo/stamps:board" } as never
  const on = (step: Step) => performOn([step], {}, [stranger])
  const refused = { ok: false, reason: "unreadable", page: "x1", code: "W027" }
  expect(on({ action: "@matomezu/base:entry-rename", args: { entry: "x1", title: "改" } })).toMatchObject(refused)
  expect(on({ action: "@matomezu/base:entry-trash", args: { entry: "x1" } })).toMatchObject(refused)
  expect(on({ action: "@matomezu/base:entry-duplicate", args: { entry: "x1" }, ids: ["d1"] })).toMatchObject({
    ok: false,
  })
  expect(on({ action: UPDATE, args: { title: "改" }, on: { page: "x1" } })).toMatchObject(refused)
  // 外のページと関係ないアクションは行える
  expect(on({ action: "@matomezu/base:folder-create", args: { title: "新" }, ids: ["f1"] })).toMatchObject({
    ok: true,
    pages: [],
  })
})
