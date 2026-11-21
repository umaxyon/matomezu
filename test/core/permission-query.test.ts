// 認可ステップが受ける行う前の問い: ページ・アノテーションが対象のアクションは、宛先のページと、それを入れているフォルダの列（近い順）で問う（kind page）。
// ブックが対象のアクションと、宛先のページが分からない問いは、ブックで問う（kind folder）
import { expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import type { PermissionDef, PermissionQuery } from "../../web/src/core/def/permission"
import { actionQuery, inspect } from "../../web/src/core/inspect"
import { DRAWING, drawingPage, testBinder, testBook } from "../lineup"
import { CORE_CATALOG } from "../support"

const seen: PermissionQuery[] = []
const watch: PermissionDef = {
  id: "test:watch",
  title: "@matomezu/base:Locked",
  aiDescription: "",
  denies: q => {
    seen.push(q)
    return false
  },
}
const catalog = {
  ...CORE_CATALOG,
  permissions: new Map<string, unknown>([["test:watch", watch]]),
} as unknown as typeof CORE_CATALOG
const ctx = { catalog, controlCenter: null, actor: USER }
const inBinder = drawingPage("s1", { title: "中" })
const book = testBook("b1", "本", [drawingPage("p1"), testBinder("f1", "束", DRAWING, inBinder)])
const asked = (action: string, where?: Parameters<typeof actionQuery>[3]) => {
  seen.length = 0
  inspect(catalog, actionQuery(catalog, action, { book }, where), ctx as never)
  return seen[0]
}

test("ページが対象のアクションは、宛先のページと、入れているフォルダの列（バインダ → ブック）で問う。フォルダは中身の id だけを持つ", () => {
  const q = asked("@matomezu/paper:item-remove", { page: "s1", ids: ["i1"] })
  if (q?.kind !== "page") throw new Error("kind page で問うはず")
  expect(q.page).toBe(inBinder)
  expect(q.folders.map(f => [f.folderRole, f.id])).toEqual([
    ["binder", "f1"],
    ["book", "b1"],
  ])
  expect(q.folders[0]?.lineup).toEqual([{ kind: "page", id: "s1" }])
  expect(q.where).toEqual({ ids: ["i1"] })
  expect(asked("@matomezu/paper:item-remove", { page: "p1" })).toMatchObject({ kind: "page", folders: [{ id: "b1" }] })
})

test("アノテーションが対象のアクションも、宛先のページで問う", () => {
  const q = asked("@matomezu/base:note-add", { page: "p1" })
  expect(q).toMatchObject({ kind: "page", page: { id: "p1" } })
})

test("ブックが対象のアクションは、ページを名指しても、ブックで問う。ページが対象でも、宛先のページが分からなければブックで問う", () => {
  expect(asked("@matomezu/base:page-remove", { page: "p1" })).toMatchObject({
    kind: "folder",
    folder: book,
    where: { page: "p1" },
  })
  expect(asked("@matomezu/paper:item-remove")).toMatchObject({ kind: "folder", folder: book })
  expect(asked("@matomezu/paper:item-remove", { page: "nope" })).toMatchObject({ kind: "folder", folder: book })
})
