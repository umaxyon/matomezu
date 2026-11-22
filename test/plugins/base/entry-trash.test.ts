// ゴミ箱: 戻す先の選びと、entry-trash（入っていたフォルダから外してゴミ箱の並びへ。開いていたステージは何も開かない）・entry-restore・entry-purge・trash-empty。
// ロック中は入れない。ゴミ箱のブックはブックが対象のアクションで変えられない
import { expect, test } from "bun:test"
import { USER } from "../../../web/src/core/actor"
import { pagesOf } from "../../../web/src/core/book"
import { type Folders, HOME_ID, type PlainFolder, TRASH_ID } from "../../../web/src/core/folders"
import { permittedIn } from "../../../web/src/core/perform-world"
import { recentBookScreen, screenOf } from "../../../web/src/core/window"
import { createBookIn } from "../../../web/src/plugins/base/book-new/create-book"
import { restoreTargetOf } from "../../../web/src/plugins/base/library/entries"
import { addPageIn } from "../../../web/src/plugins/base/pages/add-page"
import { worldOf } from "../../../web/src/store/world"
import { memoryClient } from "../../host-client/memory"
import { newStore } from "../../support"

const NOW = "2026-10-29T01:00:00.000Z"

test("戻す先は、元いたフォルダ。無ければ・ゴミ箱の中ならその上のフォルダをたどり、どれも無ければ書庫ホーム", () => {
  const folder = (id: string, ...lineup: string[]): PlainFolder => ({
    folderRole: "folder",
    id,
    title: id,
    lineup: lineup.map(l => ({ kind: "folder", id: l })),
  })
  // 書庫ホーム > a > c、ゴミ箱 > d
  const folders: Folders = {
    [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: [{ kind: "folder", id: "a" }] },
    a: folder("a", "c"),
    c: folder("c"),
    d: folder("d"),
    [TRASH_ID]: {
      folderRole: "trash",
      id: TRASH_ID,
      lineup: [{ kind: "folder", id: "d", trashed: NOW, from: ["a", HOME_ID] }],
    },
  }
  expect(restoreTargetOf(folders, ["c", "a", HOME_ID])).toBe("c")
  expect(restoreTargetOf(folders, ["gone", "c", "a", HOME_ID])).toBe("c")
  expect(restoreTargetOf(folders, ["d", "a", HOME_ID])).toBe("a")
  expect(restoreTargetOf(folders, [TRASH_ID, "gone"])).toBe(HOME_ID)
  expect(restoreTargetOf(folders, [])).toBe(HOME_ID)
})

test("entry-trash はブックをゴミ箱の並びへ移し、開いていたブックスクリーンは閉じる。無いブックは断る", () => {
  const { state, actions } = newStore({ now: () => NOW })
  expect(actions.perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  expect("b1" in state.getState().books).toBe(false)
  expect(state.getState().trash.b1?.id).toBe("b1")
  expect(state.getState().folders[TRASH_ID]?.lineup).toEqual([
    { kind: "book", id: "b1", trashed: NOW, from: [HOME_ID] },
  ])
  expect(state.getState().folders[HOME_ID]?.lineup.some(r => r.id === "b1")).toBe(false)
  expect(recentBookScreen(state.getState().window)).toBeUndefined()
  expect(actions.perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(false)
})

test("分けたステージの片方のブックが無くなると、そのステージだけ閉じる。戻しても開き直さない", () => {
  const { state, actions } = newStore({ now: () => NOW })
  actions.split("s1")
  const right = screenOf(state.getState().window).stages[1]?.id ?? ""
  actions.openBook(right, "b2")
  expect(actions.perform("@matomezu/base:entry-trash", { entry: "b2" }).ok).toBe(true)
  expect(screenOf(state.getState().window).stages.map(s => s.opened?.outermost.id)).toEqual(["b1"])
  expect(actions.perform("@matomezu/base:entry-restore", { entry: "b2" }).ok).toBe(true)
  expect(screenOf(state.getState().window).stages.map(s => s.opened?.outermost.id)).toEqual(["b1"])
})

test("ゴミ箱のブックは、ブックが対象のアクションでは無いものとして断る", () => {
  const { actions } = newStore()
  actions.perform("@matomezu/base:entry-trash", { entry: "b1" })
  expect(actions.perform("@matomezu/base:book-update", { title: "x" }, { book: "b1" })).toEqual({
    ok: false,
    reason: "no-book",
  })
})

test("ロック中のブックと、ロック中のページを持つブックはゴミ箱に入れられない（locked）", () => {
  const store = newStore()
  const { actions } = store
  addPageIn(store, "s1", { type: "@matomezu/drawing:drawing", title: "ページ 2" })
  const page = pagesOf(store.state.getState().books.b1!)[1]?.id as string
  actions.perform("@matomezu/base:page-lock", {}, { page })
  expect(actions.perform("@matomezu/base:entry-trash", { entry: "b1" })).toEqual({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
    book: "b1",
  })
  actions.perform("@matomezu/base:page-unlock", {}, { page })
  actions.perform("@matomezu/base:book-lock", {}, { book: "b1" })
  expect(actions.perform("@matomezu/base:entry-trash", { entry: "b1" })).toEqual({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
    book: "b1",
  })
})

test("ロック中のページを持つブックのゴミ箱入れは、行う前の問いでも止める（ブックの全部を変えるので、どのページのロックも効く）", () => {
  const store = newStore()
  addPageIn(store, "s1", { type: "@matomezu/drawing:drawing", title: "ページ 2" })
  const page = pagesOf(store.state.getState().books.b1!)[1]?.id as string
  store.actions.perform("@matomezu/base:page-lock", {}, { page })
  const world = worldOf(store.state.getState())
  const ctx = { catalog: store.catalog.core, controlCenter: store.controlCenter, actor: USER }
  expect(permittedIn(world, "@matomezu/base:entry-trash", { entry: "b1" }, undefined, ctx)).toEqual({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
    book: "b1",
  })
})

test("戻す・消す・空にする。ゴミ箱に無いブックは戻さず消さない。メモリのホストは残したブックを合わせる", async () => {
  const host = memoryClient([])
  const store = newStore({ books: [], saved: (await host.load()).saved })
  host.connect(store)
  const made = ["一", "二", "三"].map(title => {
    createBookIn(store, "s1", { into: HOME_ID, title })
    return Object.values(store.state.getState().books).find(b => b.title === title)?.id as string
  })
  const [one, two, three] = made as [string, string, string]
  const { perform } = store.actions
  expect(perform("@matomezu/base:entry-restore", { entry: one }).ok).toBe(false)
  expect(perform("@matomezu/base:entry-purge", { entries: [one] }).ok).toBe(false)
  for (const id of made) perform("@matomezu/base:entry-trash", { entry: id })
  const trash = () =>
    Object.values(store.state.getState().trash)
      .map(b => b.title)
      .sort()
  expect(trash()).toEqual(["一", "三", "二"])
  expect(perform("@matomezu/base:entry-restore", { entry: one }).ok).toBe(true)
  expect(trash()).toEqual(["三", "二"])
  expect(store.state.getState().books[one]?.title).toBe("一")
  expect(store.state.getState().folders[HOME_ID]?.lineup.at(-1)).toEqual({ kind: "book", id: one })
  expect(perform("@matomezu/base:entry-purge", { entries: [two] }).ok).toBe(true)
  expect(trash()).toEqual(["三"])
  expect(host.books.has(two)).toBe(false)
  expect(perform("@matomezu/base:trash-empty", {}).ok).toBe(true)
  expect(trash()).toEqual([])
  expect(three in store.state.getState().books || host.books.has(three)).toBe(false)
  expect(host.books.has(one)).toBe(true)
})

test("ブックの外のバインダ・ページ・ブックと、それらを持つフォルダを、ゴミ箱に入れて戻し、消せる（ゴミ箱の中もブックの外の決まりで見る）", () => {
  const { state, actions } = newStore({ now: () => NOW })
  const act = (action: string, args: Record<string, unknown>) =>
    (actions.perform as (id: string, args: unknown) => ReturnType<typeof actions.perform>)(
      `@matomezu/base:${action}`,
      args,
    )
  const lineup = (id: string) => state.getState().folders[id]?.lineup.map(r => r.id)
  const created = act("folder-create", { title: "仕事", into: HOME_ID })
  const into = (created.ok && (created.result as { folder: string }).folder) as string
  const added = actions.perform(
    "@matomezu/base:page-add",
    { type: "@matomezu/slide-page:slide", title: "1", into: { newBinder: "説明" } } as never,
    { book: "b1" },
  )
  const { page, binder } = (added.ok && added.result) as { page: string; binder: string }
  expect(act("entry-move", { entry: binder, into: HOME_ID }).ok).toBe(true)
  expect(act("entry-move", { entry: "p1", into: HOME_ID }).ok).toBe(true)
  for (const entry of [binder, "p1", "b2"]) {
    expect([entry, act("entry-trash", { entry }).ok]).toEqual([entry, true])
    expect([entry, act("entry-restore", { entry }).ok]).toEqual([entry, true])
  }
  expect(lineup(binder)).toEqual([page])
  expect(lineup(TRASH_ID)).toEqual([])
  // 外のバインダ・ページを持つフォルダごと
  expect(act("entry-move", { entry: binder, into }).ok).toBe(true)
  expect(act("entry-move", { entry: "p1", into }).ok).toBe(true)
  expect(act("entry-trash", { entry: into }).ok).toBe(true)
  expect(act("entry-trash", { entry: "b2" }).ok).toBe(true)
  expect(act("entry-purge", { entries: ["b2"] }).ok).toBe(true)
  expect(act("entry-restore", { entry: into }).ok).toBe(true)
  expect(lineup(into)).toEqual([binder, "p1"])
  expect(state.getState().folders.b2).toBeUndefined()
})
