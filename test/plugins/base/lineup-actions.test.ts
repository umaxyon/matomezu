// 並びを変えるアクション（base）: ページを足す所（ブックの並び・フォルダ・新しいフォルダ）、フォルダのアクション、まとめて変える pages-update、
// 最初のページと一緒にブックを作る book-create、ページのタイプを替える結果を断る perform
import { describe, expect, test } from "bun:test"
import { USER } from "../../../web/src/core/actor"
import { findFolder, findPage, lineupOf, pagesIn, pagesOf, putPage } from "../../../web/src/core/book"
import { checkCoreCatalog } from "../../../web/src/core/core-catalog"
import { perform } from "../../../web/src/core/perform"
import type { Book } from "../../../web/src/core/schema/book"
import {
  FOLDER_DUPLICATE,
  FOLDER_MOVE,
  FOLDER_REMOVE,
  FOLDER_UPDATE,
} from "../../../web/src/plugins/base/page-tabs/folders"
import { PAGE_ADD } from "../../../web/src/plugins/base/page-tabs/page-add"
import { DRAWING, drawingPage, MARKDOWN, SLIDE, testBook, testFolder, testPage } from "../../lineup"
import { BUILTIN_PARTS, CORE_CATALOG, sequence } from "../../support"

const ctx = () => ({
  catalog: CORE_CATALOG,
  controlCenter: "@matomezu/control-center:control-center",
  lang: "ja" as const,
  newId: sequence("n"),
  now: "2026-11-16T00:00:00.000Z",
  actor: USER,
})
const slide = (id: string) => testPage(SLIDE, id, { title: id, paper: "@matomezu/base:ratio-16x9" })
const book = testBook("b1", "混ざる", [
  drawingPage("p1"),
  testFolder("f1", "スライド", SLIDE, slide("s1"), slide("s2")),
])
const run = (b: Book, action: string, args: object) => perform(b as never, action as never, args as never, ctx())

describe("page-add", () => {
  test("まとまらないタイプのページはブックの並びに、名前を渡さなければ重ならない（無題）で足す", () => {
    const done = run(book, PAGE_ADD.id, { type: MARKDOWN, index: 1 })
    expect(done).toMatchObject({ ok: true, result: { page: "n1" } })
    expect(done.ok && lineupOf(done.next).map(e => e.id)).toEqual(["p1", "n1", "f1"])
    expect(done.ok && findPage(done.next, "n1")?.page).toMatchObject({ type: MARKDOWN, title: "（無題）" })
    // まとまらないタイプに入れる所は書けない
    expect(run(book, PAGE_ADD.id, { type: DRAWING, into: { folder: "f1" } }).ok).toBe(false)
  })

  test("まとまるタイプは入れる所が要り、今あるフォルダか、新しいフォルダに入れる", () => {
    expect(run(book, PAGE_ADD.id, { type: SLIDE }).ok).toBe(false)
    const into = run(book, PAGE_ADD.id, { type: SLIDE, title: "s3", into: { folder: "f1" }, index: 0 })
    expect(into.ok && pagesIn(into.next, "f1").map(p => p.id)).toEqual(["n1", "s1", "s2"])
    const made = run(book, PAGE_ADD.id, { type: SLIDE, into: { newFolder: "発表" }, index: 0 })
    expect(made).toMatchObject({ ok: true, result: { page: "n1", folder: "n2" } })
    expect(made.ok && lineupOf(made.next).map(e => e.id)).toEqual(["n2", "p1", "f1"])
    expect(made.ok && findFolder(made.next, "n2")).toMatchObject({ title: "発表", pageType: SLIDE })
    expect(made.ok && pagesIn(made.next, "n2").map(p => p.id)).toEqual(["n1"])
    // 同じ入れ物の中で同じ名前は付けられない
    expect(run(book, PAGE_ADD.id, { type: SLIDE, into: { newFolder: "スライド" } }).ok).toBe(false)
    expect(run(book, PAGE_ADD.id, { type: SLIDE, title: "s1", into: { folder: "f1" } }).ok).toBe(false)
  })
})

describe("フォルダのアクション", () => {
  test("名前を変える・動かす（同じ並びの中）。ほかと同じ名前は断る", () => {
    const renamed = run(book, FOLDER_UPDATE.id, { folder: "f1", title: "発表" })
    expect(renamed.ok && findFolder(renamed.next, "f1")?.title).toBe("発表")
    expect(run(book, FOLDER_UPDATE.id, { folder: "f1", title: "ページ 1" }).ok).toBe(false)
    const moved = run(book, FOLDER_MOVE.id, { folder: "f1", index: 0 })
    expect(moved.ok && lineupOf(moved.next).map(e => e.id)).toEqual(["f1", "p1"])
  })

  test("複製は中のページごと（id を振り直し、名前は「元の名前 2」）、削除は中のページごと", () => {
    const copied = run(book, FOLDER_DUPLICATE.id, { folder: "f1" })
    expect(copied.ok).toBe(true)
    if (!copied.ok) return
    const [, , copy] = lineupOf(copied.next)
    expect(copy).toMatchObject({ kind: "folder", title: "スライド 2", pageType: SLIDE })
    const ids = copy?.kind === "folder" ? copy.lineup.map(p => p.id) : []
    expect(ids).toHaveLength(2)
    expect(ids.some(id => ["s1", "s2"].includes(id))).toBe(false)
    expect(copy?.kind === "folder" && copy.lineup.map(p => p.title)).toEqual(["s1", "s2"])
    const removed = run(book, FOLDER_REMOVE.id, { folder: "f1" })
    expect(removed.ok && pagesOf(removed.next).map(p => p.id)).toEqual(["p1"])
  })
})

describe("pages-update", () => {
  const THEME = "@matomezu/base:page-theme"
  const TEXT_COLORS = "@matomezu/base:page-text-colors"

  test("全部のページの設定を 1 回で変え、ロックしたページと、その項目を選んでいないタイプのページは飛ばす", () => {
    const mixed = testBook("b2", "混ざる", [
      drawingPage("p1"),
      drawingPage("p2", { title: "2", locked: true }),
      testPage(MARKDOWN, "m1", { title: "文書" }),
    ])
    const done = run(mixed, "@matomezu/base:pages-update", {
      pages: "all",
      settings: { [TEXT_COLORS]: { "@matomezu/base:warn": "#111111" } },
    })
    expect(done).toMatchObject({ ok: true, result: { updated: ["p1"], skipped: ["p2", "m1"] } })
    // 名指したページだけ
    const one = run(mixed, "@matomezu/base:pages-update", {
      pages: ["m1"],
      settings: { [THEME]: "@matomezu/base:standard" },
    })
    expect(one).toMatchObject({ ok: true, result: { updated: ["m1"], skipped: [] } })
    // 1 枚も変えられなければ断り、無いページを名指しても断る
    expect(
      run(mixed, "@matomezu/base:pages-update", { pages: ["p2"], settings: { [THEME]: "@matomezu/base:standard" } }).ok,
    ).toBe(false)
    expect(
      run(mixed, "@matomezu/base:pages-update", { pages: ["nope"], settings: { [THEME]: "@matomezu/base:standard" } })
        .ok,
    ).toBe(false)
  })
})

test("book-create は、名前だけの空のブックか、最初のページと一緒に作る", () => {
  const made = perform({}, "@matomezu/base:book-create", { title: "新しい", page: { type: DRAWING } }, ctx())
  expect(made).toMatchObject({ ok: true, result: { book: "n1", page: { page: "n2" } } })
  expect(made.ok && pagesOf(made.next.n1!).map(p => [p.id, p.type])).toEqual([["n2", DRAWING]])
  // 最初のページを作れなければ、ブックも作らない
  expect(perform({}, "@matomezu/base:book-create", { title: "x", page: { type: SLIDE } }, ctx()).ok).toBe(false)
})

test("アクションの結果でページのタイプが替わっていたら、perform は断る", () => {
  const def = CORE_CATALOG.actions.get("@matomezu/base:page-update")!
  const swapped = {
    ...def,
    run: (b: Book) => ({ next: putPage(b, { ...drawingPage("p1"), type: MARKDOWN } as never), result: {} }),
  }
  const catalog = { ...CORE_CATALOG, actions: new Map([...CORE_CATALOG.actions, [def.id, swapped]]) }
  expect(perform(book as never, def.id as never, { page: "p1" } as never, { ...ctx(), catalog })).toEqual({
    ok: false,
    reason: "refused",
  })
})

test('台帳アセンブル: "book" スコープのアクションがタイプで決まる付く先を持つと E063、設定の項目の holder の書き違いは E064・E065', () => {
  const addPage = BUILTIN_PARTS.actions.find(a => a.id === PAGE_ADD.id)!
  const typed = { ...addPage, attach: { items: ["@matomezu/box:shape-nest-box"] } }
  expect(
    checkCoreCatalog({ ...BUILTIN_PARTS, actions: BUILTIN_PARTS.actions.map(a => (a === addPage ? typed : a)) }).map(
      p => p.code,
    ),
  ).toEqual(["E063"])
  const [setting] = BUILTIN_PARTS.settings
  const [user] = BUILTIN_PARTS.userSettings
  const noHolder = { ...setting!, holder: undefined }
  const withHolder = { ...user!, holder: "page" }
  expect(
    checkCoreCatalog({
      ...BUILTIN_PARTS,
      settings: BUILTIN_PARTS.settings.map(s => (s === setting ? noHolder : s)),
      userSettings: BUILTIN_PARTS.userSettings.map(s => (s === user ? withHolder : s)),
    } as never)
      .map(p => p.code)
      .filter(c => c !== "E062"), // holder を外した項目を選んでいるタイプは、E062 にもなる
  ).toEqual(["E064", "E065"])
})
