// 日付フォルダ（base の library/today-folder.ts）: 置くフォルダを言わずに作るページ（page-create）とブック（book-create）は、
// ドキュメントの直下の、名前がその日の日付のフォルダに入る（無ければ同じ書き込みで、ドキュメントの先頭に作る）
import { expect, test } from "bun:test"
import { USER } from "../../../web/src/core/actor"
import { HOME_ID, type Library } from "../../../web/src/core/folders"
import { perform } from "../../../web/src/core/perform"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { DOCUMENTS as DOCUMENTS_DEF } from "../../../web/src/plugins/base/library/system-folders"
import { DRAWING, SLIDE, testBook } from "../../lineup"
import { CORE_CATALOG, libraryWith, NAMING, sequence } from "../../support"

const DOCUMENTS = DOCUMENTS_DEF.id
// 書庫が対象のアクションを、id の文字列で行う
const act = perform as unknown as (
  library: Library,
  action: string,
  args: object,
  c: object,
) => { ok: boolean; reason?: string }
const DAY = "2026-11-16"
const ctx = (today = DAY, newId = sequence("n")) => ({
  catalog: CORE_CATALOG,
  controlCenter: BUILTIN_CONTROL_CENTER,
  lang: "ja" as const,
  newId,
  now: `${today}T00:00:00.000Z`,
  today,
  actor: USER,
  naming: NAMING,
})

// ドキュメント（id は docs）を書庫ホームの先頭に持つ書庫
function withDocuments(base: Library = libraryWith([])): Library {
  const home = base.folders[HOME_ID]!
  return {
    ...base,
    folders: {
      ...base.folders,
      docs: { folderRole: "folder", id: "docs", systemFolder: DOCUMENTS, lineup: [] },
      [HOME_ID]: { ...home, lineup: [{ kind: "folder", id: "docs" }, ...home.lineup] },
    },
  } as Library
}
type Made = { ok: true; next: Library; result: Record<string, unknown> }
function run(library: Library, action: string, args: object, c = ctx()): Made {
  const done = act(library, `@matomezu/base:${action}`, args, c)
  if (!done.ok) throw new Error(`${action}: ${JSON.stringify(done)}`)
  return done as unknown as Made
}
const refusal = (library: Library, action: string, args: object, c = ctx()) =>
  act(library, `@matomezu/base:${action}`, args, c)
const ids = (library: Library, folder: string) => library.folders[folder]?.lineup.map(r => r.id)
const titles = (library: Library, folder: string) =>
  ids(library, folder)?.map(id => (library.folders[id] as { title?: string }).title)

test("page-create は、フォルダを言わなければ、ドキュメントの先頭にその日の名前のフォルダを作って入れる。同じ日の次のページは同じフォルダの末尾", () => {
  const first = run(withDocuments(), "page-create", { type: DRAWING, title: "一" })
  expect(first.result).toEqual({ page: "n2", folder: "n1" })
  expect(first.next.folders.n1).toEqual({
    folderRole: "folder",
    id: "n1",
    title: DAY,
    lineup: [{ kind: "page", id: "n2" }],
  })
  expect(ids(first.next, "docs")).toEqual(["n1"])
  expect(ids(first.next, HOME_ID)).toEqual(["docs"])
  const second = run(first.next, "page-create", { type: DRAWING, title: "二" }, ctx(DAY, sequence("m")))
  expect(second.result).toEqual({ page: "m2", folder: "n1" })
  expect(ids(second.next, "n1")).toEqual(["n2", "m2"])
  expect(ids(second.next, "docs")).toEqual(["n1"])
  // 次の日のフォルダは、前の日の上
  const tomorrow = run(second.next, "page-create", { type: DRAWING }, ctx("2026-11-17", sequence("t")))
  expect(titles(tomorrow.next, "docs")).toEqual(["2026-11-17", DAY])
})

test("page-create は、フォルダを言えばそこに入れ、入れた先を folder で返す。フォルダを言わずに index は言えない。ドキュメントが無ければ断る", () => {
  const home = run(withDocuments(), "page-create", { folder: HOME_ID, type: DRAWING })
  expect(home.result).toEqual({ page: "n1", folder: HOME_ID })
  expect(ids(home.next, "docs")).toEqual([])
  expect(refusal(withDocuments(), "page-create", { type: DRAWING, index: 0 })).toMatchObject({
    ok: false,
    reason: "bad-args",
  })
  expect(refusal(libraryWith([]), "page-create", { type: DRAWING })).toEqual({ ok: false, reason: "refused" })
})

test("日付フォルダは名前で引く: 名前を変えた・よそへ動かした・ゴミ箱へ入れたフォルダには入れず、新しく作る", () => {
  const made = run(withDocuments(), "page-create", { type: DRAWING }).next
  const again = (library: Library) => run(library, "page-create", { type: DRAWING }, ctx(DAY, sequence("m")))
  const renamed = again(run(made, "entry-rename", { entry: "n1", title: "議事録" }).next)
  expect(renamed.result.folder).toBe("m1")
  expect(titles(renamed.next, "docs")).toEqual([DAY, "議事録"])
  const moved = again(run(made, "entry-move", { entry: "n1", into: HOME_ID }).next)
  expect(moved.result.folder).toBe("m1")
  expect(ids(moved.next, "docs")).toEqual(["m1"])
  const trashed = again(run(made, "entry-trash", { entry: "n1" }).next)
  expect(trashed.result.folder).toBe("m1")
  expect(ids(trashed.next, "docs")).toEqual(["m1"])
})

test("ドキュメントに、その日の名前のフォルダでない物（ブック）が在れば、日付フォルダを作れずに title-taken で断る", () => {
  const library = run(withDocuments(), "book-create", { title: DAY, into: "docs" }).next
  const taken = { ok: false, reason: "refused", kind: "title-taken" }
  expect(refusal(library, "page-create", { type: DRAWING })).toMatchObject(taken)
  expect(refusal(library, "book-create", { title: "新" })).toMatchObject(taken)
})

test("バインダにまとまるタイプ（スライド）は、そのページだけの新しいバインダごと、日付フォルダに入る", () => {
  const done = run(withDocuments(), "page-create", { type: SLIDE, into: { newBinder: "発表" } })
  expect(done.result).toEqual({ page: "n2", binder: "n3", folder: "n1" })
  expect(done.next.folders.n1?.lineup).toEqual([{ kind: "binder", id: "n3" }])
  expect(done.next.folders.n3?.lineup).toEqual([{ kind: "page", id: "n2" }])
})

test("日付フォルダの id は、在っても無くても同じ数だけ同じ順で引く（行い直しで id が変わらない）", () => {
  // 引いた id の数を数える newId（書庫に在る id と当たらないよう、頭を変える）
  const counting = (prefix: string) => {
    const next = sequence(prefix)
    const drawn: string[] = []
    return { drawn, newId: () => drawn[drawn.push(next()) - 1]! }
  }
  const [a, b, c, d] = [counting("a"), counting("b"), counting("c"), counting("d")]
  const first = run(withDocuments(), "page-create", { type: DRAWING }, ctx(DAY, a.newId))
  expect(first.result).toEqual({ page: "a2", folder: "a1" })
  // 日付フォルダが在っても、フォルダの分の id を引いて捨てる
  expect(run(first.next, "page-create", { type: DRAWING }, ctx(DAY, b.newId)).result).toEqual({
    page: "b2",
    folder: "a1",
  })
  expect(b.drawn).toHaveLength(a.drawn.length)
  const book = { title: "新", page: { type: DRAWING } }
  expect(run(withDocuments(), "book-create", book, ctx(DAY, c.newId)).result).toMatchObject({ into: "c3" })
  expect(run(first.next, "book-create", book, ctx(DAY, d.newId)).result).toMatchObject({ book: "d1", into: "a1" })
  expect(d.drawn).toHaveLength(c.drawn.length)
})

test("book-create は、into を言わなければ、日付フォルダに作り、入れた先を into で返す。into を言えばそこに作る", () => {
  const library = withDocuments(libraryWith([testBook("b1", "B1", [])]))
  const made = run(library, "book-create", { title: "新" })
  expect(made.result).toEqual({ book: "n1", into: "n2" })
  expect(made.next.folders.n2).toMatchObject({ folderRole: "folder", title: DAY, lineup: [{ kind: "book", id: "n1" }] })
  expect(ids(made.next, HOME_ID)).toEqual(["docs", "b1"])
  // 同じ日の次のブックは、同じフォルダの先頭（at の既定）
  const next = run(made.next, "book-create", { title: "次" }, ctx(DAY, sequence("m")))
  expect(next.result).toEqual({ book: "m1", into: "n2" })
  expect(ids(next.next, "n2")).toEqual(["m1", "n1"])
  const home = run(library, "book-create", { title: "新", into: HOME_ID })
  expect(home.result).toEqual({ book: "n1", into: HOME_ID })
  expect(ids(home.next, HOME_ID)).toEqual(["docs", "n1", "b1"])
  expect(refusal(libraryWith([]), "book-create", { title: "新" })).toEqual({ ok: false, reason: "refused" })
})
