// ページ 1 枚ごとに問う許可スコープ（{ pages, denied: "skip" }）: 認可ステップかページのタイプが止めたページは飛ばし、止められなかったページを run に渡す
import { expect, test } from "bun:test"
import { z } from "zod"
import { USER } from "../../web/src/core/actor"
import { defineAction } from "../../web/src/core/def/action"
import type { PermissionDef } from "../../web/src/core/def/permission"
import { perform, permitted } from "../../web/src/core/perform"
import { drawingPage, MARKDOWN, testBook, testPage } from "../lineup"
import { CORE_CATALOG } from "../support"

const TOUCH = "test:touch"
const HOLD = "test:hold"

// 名指したページのうち、渡された（止められなかった）ページの id を返すだけのアクション
const touch = defineAction({
  id: TOUCH,
  title: "@matomezu/base:Change pages",
  aiDescription: "",
  target: "book",
  attach: { books: true },
  permissionScope: { pages: "pages", denied: "skip" },
  args: z.object({ pages: z.union([z.literal("all"), z.array(z.string())]) }),
  run: (book, _args, ctx) => ({ next: book, result: { pages: ctx.permittedPages } }),
})

// ページ p2 を変えるアクションを止める認可ステップ
const hold: PermissionDef = {
  id: HOLD,
  title: "@matomezu/base:Locked",
  aiDescription: "",
  denies: q => q.kind === "folder" && q.action.id === TOUCH && q.where?.page === "p2",
}

const markdown = CORE_CATALOG.pageTypes.get(MARKDOWN)!
const catalog = {
  ...CORE_CATALOG,
  actions: new Map<string, unknown>([...CORE_CATALOG.actions, [TOUCH, touch]]),
  permissions: new Map<string, unknown>([...CORE_CATALOG.permissions, [HOLD, hold]]),
  pageTypes: new Map<string, unknown>([
    ...CORE_CATALOG.pageTypes,
    [MARKDOWN, { ...markdown, actions: { without: [TOUCH] } }],
  ]),
} as unknown as typeof CORE_CATALOG

const book = testBook("b1", "混ざる", [
  drawingPage("p1"),
  drawingPage("p2", { title: "2" }),
  testPage(MARKDOWN, "m1", { title: "文書" }),
  drawingPage("p3", { title: "3" }),
])
const ctx = { catalog, controlCenter: null, lang: "en", newId: () => "n", now: "2026-01-01T00:00:00.000Z", actor: USER }
const act = (pages: "all" | string[]) => perform(book as never, TOUCH as never, { pages } as never, ctx as never)
const ask = (pages: "all" | string[]) => permitted(book, TOUCH, { pages }, ctx as never)

test("止められなかったページだけを、ブックのページの順で run に渡す。全部止められたら、最初のページを止めた理由で断る。行う前の問いも同じ答え", () => {
  // 認可ステップが止めた p2 と、タイプが外した m1 は飛ばす
  expect(act("all")).toMatchObject({ ok: true, result: { pages: ["p1", "p3"] } })
  expect(act(["p3", "p2", "p1"])).toMatchObject({ ok: true, result: { pages: ["p1", "p3"] } })
  expect(ask("all")).toEqual({ ok: true })
  // 全部止められた: 認可ステップなら denied とその id、タイプが外したなら not-allowed
  expect(act(["p2"])).toEqual({ ok: false, reason: "denied", permission: HOLD })
  expect(ask(["p2"])).toEqual({ ok: false, reason: "denied", permission: HOLD })
  expect(act(["m1"])).toEqual({ ok: false, reason: "not-allowed" })
  expect(act(["p2", "m1"])).toEqual({ ok: false, reason: "denied", permission: HOLD })
  // ブックに無いページだけを名指したら、ページでは問わず run に任せる（渡るページは無い）
  expect(act(["nope"])).toMatchObject({ ok: true, result: {} })
})
