// ブックの外のバインダを窓に出す（store の showOutsideBinderStage・openOutsideBinder・openToStage）: 開く・ページを替える・中のページを変える・元に戻す・ロック
import { expect, test } from "bun:test"
import { stagePlacesOf } from "../../web/src/core/address"
import { NO_OUTERMOST } from "../../web/src/core/folders-tree"
import { shownPageId } from "../../web/src/core/stage"
import { stageIn } from "../../web/src/core/window"
import { isShown } from "../../web/src/store/commands"
import { NO_STAGE } from "../../web/src/store/dialogs"
import { openedIn } from "../../web/src/store/store"
import { drawingPage, SLIDE, testBinder, testPage } from "../lineup"
import { newStore, sequence, worldRows } from "../support"

type Store = ReturnType<typeof newStore>
// 書庫ホームに、スライド s1・s2 の入ったブックの外のバインダ n1 が在る世界から始めた store
function withBinder(): Store {
  const store = newStore({ newId: sequence() })
  const books = Object.values(store.state.getState().books)
  const n1 = testBinder("n1", "発表", SLIDE, testPage(SLIDE, "s1", { title: "表紙" }), testPage(SLIDE, "s2"))
  store.receive({ ...worldRows(books, [n1]), settings: {} }, [])
  return store
}

test("ブックの外のバインダを窓に出すと最初のページで開き、名指したページへ替えられる。開けるバインダでなければ何もしない", () => {
  const store = withBinder()
  const stage = store.actions.showOutsideBinderStage("n1")
  expect(stage).not.toBe(NO_STAGE)
  expect(stageIn(store.state.getState().window, stage)?.opened).toMatchObject({
    kind: "page",
    outermost: { kind: "binder", id: "n1" },
    page: "s1",
  })
  // もう開いていれば、そのステージ。名指せばそのページへ、名指さなければ開いているページのまま
  expect(store.actions.showOutsideBinderStage("n1", "s2")).toBe(stage)
  expect(openedIn(store, stage)).toEqual({ book: "n1", page: "s2" })
  expect(store.actions.showOutsideBinderStage("n1")).toBe(stage)
  expect(openedIn(store, stage)).toEqual({ book: "n1", page: "s2" })
  // 開いているステージのページ一覧から替える（openPage）。そのバインダに無いページへは替えない
  store.actions.openPage(stage, "s1")
  expect(openedIn(store, stage)).toEqual({ book: "n1", page: "s1" })
  // ページ一覧が呼ぶコマンド page-open も、ブックの外のバインダのステージで使える
  expect(store.actions.command(stage, "@matomezu/base:page-open", "s2")).toBe(true)
  expect(openedIn(store, stage)).toEqual({ book: "n1", page: "s2" })
  store.actions.openPage(stage, "s1")
  store.actions.openPage(stage, "nothing")
  expect(openedIn(store, stage)).toEqual({ book: "n1", page: "s1" })
  const before = store.state.getState().window
  expect(store.actions.showOutsideBinderStage("s1")).toBe(NO_STAGE)
  expect(store.actions.showOutsideBinderStage("nothing")).toBe(NO_STAGE)
  expect(store.state.getState().window).toBe(before)
})

test("ブックを開いているステージに、ブックの外のバインダを名指したページで開ける", () => {
  const store = withBinder()
  expect(store.actions.openToStage({ to: "binder", binder: "n1", page: "s2" }, "s1")).toBe("s1")
  expect(openedIn(store, "s1")).toEqual({ book: "n1", page: "s2" })
  expect(store.actions.openToStage({ to: "binder", binder: "nothing" }, "s1")).toBe(NO_STAGE)
})

test("ページの id から開く（openPageById）と、ブックを開いているステージにも、そのページを持つブックの外のバインダを開く。もう開いていればページだけ替える", () => {
  const store = withBinder()
  store.actions.openPageById("s1", "s2")
  expect(openedIn(store, "s1")).toEqual({ book: "n1", page: "s2" })
  store.actions.openPageById("s1", "s1")
  expect(openedIn(store, "s1")).toEqual({ book: "n1", page: "s1" })
  store.actions.openPageById("s1", "nothing")
  expect(openedIn(store, "s1")).toEqual({ book: "n1", page: "s1" })
})

test("ブックの外のバインダの中のページを変えて元に戻せる。変えたページがロックされたら、元に戻すは行われず画面の履歴の段は残る", async () => {
  const store = withBinder()
  const stage = store.actions.showOutsideBinderStage("n1", "s2")
  const title = () => store.state.getState().pages.s1?.title
  expect(store.actions.perform("@matomezu/base:page-update", { title: "変えた名前" }, { page: "s1" }).ok).toBe(true)
  await Promise.resolve()
  expect(store.state.getState().history.n1?.undo).toHaveLength(1)
  expect(store.actions.command(stage, "@matomezu/base:undo")).toBe(true)
  await Promise.resolve()
  expect(title()).toBe("表紙")
  // 元に戻すと、変えたページを開く
  expect(openedIn(store, stage)).toEqual({ book: "n1", page: "s1" })
  expect(store.actions.command(stage, "@matomezu/base:redo")).toBe(true)
  await Promise.resolve()
  expect(title()).toBe("変えた名前")

  expect(store.actions.perform("@matomezu/base:page-lock", {}, { page: "s1" }).ok).toBe(true)
  await Promise.resolve()
  expect(store.actions.command(stage, "@matomezu/base:undo")).toBe(false)
  await Promise.resolve()
  expect(title()).toBe("変えた名前")
  expect(store.state.getState().history.n1?.undo.length).toBeGreaterThan(0)
})

test("ブックの外のバインダを開いた画面の場所は、ブックを名指さず開いているページを名指し、当てはめると同じバインダの同じページを開く。無くなっていればそのステージを開かない", () => {
  const store = withBinder()
  store.actions.showOutsideBinderStage("n1", "s2")
  const address = store.address()
  expect(stagePlacesOf(address).map(p => [p.outermost, p.page])).toContainEqual([NO_OUTERMOST, "s2"])
  const opens = (s: Store) =>
    s.state
      .getState()
      .window.screens.flatMap(c => c.stages?.stages.map(t => [t.opened?.outermost, shownPageId(t.opened)]) ?? [])
  const again = withBinder()
  again.locate(address)
  expect(opens(again)).toContainEqual([{ kind: "binder", id: "n1" }, "s2"])
  const gone = newStore({ newId: sequence() })
  const before = gone.state.getState().window
  gone.locate(address)
  expect(opens(gone).map(([o]) => o)).not.toContainEqual({ kind: "binder", id: "n1" })
  expect(gone.state.getState().window.screens.length).toBe(before.screens.length)
})

test("ブックの外のバインダを開いたステージで、ページ一覧のコマンドがそのバインダの中のページを足す・複製する・並べ替える。元に戻すで戻る", async () => {
  const store = withBinder()
  const stage = store.actions.showOutsideBinderStage("n1", "s1")
  const lineup = () => store.state.getState().folders.n1?.lineup.map(e => e.id)
  // 引数がまだ無い（ページ一覧の＋が出すかを問う）ときも、右クリックしたページを名指したときも出す
  const shown = (id: string, arg?: unknown) => isShown(store, store.state.getState(), stage, id as never, arg)
  expect(shown("@matomezu/base:page-add-after")).toBe(true)
  expect(shown("@matomezu/base:page-add-after", { page: "s2" })).toBe(true)
  expect(shown("@matomezu/base:page-delete", { page: "s2" })).toBe(true)
  expect(store.actions.command(stage, "@matomezu/base:page-add-after", { page: "s2" })).toBe(true)
  await Promise.resolve()
  expect(lineup()).toHaveLength(3)
  expect(lineup()?.slice(0, 2)).toEqual(["s1", "s2"])
  const added = lineup()?.[2] as string
  expect(store.state.getState().pages[added]?.type).toBe(SLIDE)
  expect(openedIn(store, stage)).toEqual({ book: "n1", page: added })

  expect(store.actions.command(stage, "@matomezu/base:page-duplicate", { page: "s1" })).toBe(true)
  await Promise.resolve()
  expect(lineup()).toHaveLength(4)
  expect(lineup()?.[0]).toBe("s1")
  const copy = lineup()?.[1] as string
  expect(store.state.getState().pages[copy]?.title).toBe("表紙 2")

  expect(store.actions.perform("@matomezu/base:page-move", { page: "s2", index: 0 }, { book: "n1" }).ok).toBe(true)
  await Promise.resolve()
  expect(lineup()?.[0]).toBe("s2")

  expect(store.actions.command(stage, "@matomezu/base:undo")).toBe(true)
  await Promise.resolve()
  expect(lineup()).toEqual(["s1", copy, "s2", added])
  expect(store.actions.command(stage, "@matomezu/base:undo")).toBe(true)
  await Promise.resolve()
  expect(lineup()).toEqual(["s1", "s2", added])
})

test("ブックの外のバインダの中のロックしたページは、複製と削除を押せない。最後の 1 枚には削除を出さない", async () => {
  const store = withBinder()
  const stage = store.actions.showOutsideBinderStage("n1", "s1")
  expect(store.actions.perform("@matomezu/base:page-lock", {}, { page: "s1" }).ok).toBe(true)
  await Promise.resolve()
  expect(store.actions.command(stage, "@matomezu/base:page-duplicate", { page: "s1" })).toBe(false)
  expect(store.actions.command(stage, "@matomezu/base:page-delete", { page: "s1" })).toBe(false)
  expect(store.actions.perform("@matomezu/base:page-remove", { page: "s2" }, { book: "n1" }).ok).toBe(true)
  await Promise.resolve()
  expect(store.actions.perform("@matomezu/base:page-unlock", {}, { page: "s1" }).ok).toBe(true)
  await Promise.resolve()
  expect(store.actions.command(stage, "@matomezu/base:page-delete", { page: "s1" })).toBe(false)
  expect(store.actions.perform("@matomezu/base:page-remove", { page: "s1" }, { book: "n1" }).ok).toBe(false)
})

test("ブックの外のバインダを開いたステージで、バインダの設定を開け、紙と向きを中のページ全部に付けられる。ロックしたページが在れば行えない", async () => {
  const store = withBinder()
  const stage = store.actions.showOutsideBinderStage("n1", "s1")
  expect(store.actions.command(stage, "@matomezu/base:binder-settings-opened")).toBe(true)
  const papers = () => ["s1", "s2"].map(id => store.state.getState().pages[id]?.orientation)
  const turned = papers()[0] === "portrait" ? "landscape" : "portrait"
  const turn = (orientation: string) =>
    store.actions.perform("@matomezu/base:binder-update", { binder: "n1", orientation } as never, { book: "n1" })
  expect(turn(turned).ok).toBe(true)
  await Promise.resolve()
  expect(papers()).toEqual([turned, turned])
  // 名前は binder-update では変えられない（書庫の entry-rename で変える）
  expect(
    store.actions.perform("@matomezu/base:binder-update", { binder: "n1", title: "別の名前" }, { book: "n1" }).ok,
  ).toBe(false)
  expect(store.actions.perform("@matomezu/base:entry-rename", { entry: "n1", title: "別の名前" }).ok).toBe(true)
  await Promise.resolve()
  expect(store.state.getState().folders.n1).toMatchObject({ title: "別の名前" })

  expect(store.actions.perform("@matomezu/base:page-lock", {}, { page: "s2" }).ok).toBe(true)
  await Promise.resolve()
  expect(turn(turned === "portrait" ? "landscape" : "portrait")).toMatchObject({ ok: false, reason: "denied" })
  expect(papers()).toEqual([turned, turned])
})

test("entry-duplicate は、ブックの外のバインダを中のページごと同じフォルダのすぐ後ろに写し、その中のページも、ブックの外のページ 1 枚も写す。ロックは写さない", async () => {
  const store = withBinder()
  const state = () => store.state.getState()
  const lineup = (id: string) => state().folders[id]?.lineup.map(r => r.id) ?? []
  const act = (args: { entry: string }) => store.actions.perform("@matomezu/base:entry-duplicate", args)
  const home = Object.values(state().folders).find(f => f.folderRole === "home")?.id as string
  expect(store.actions.perform("@matomezu/base:page-lock", {}, { page: "s1" }).ok).toBe(true)
  await Promise.resolve()

  const done = act({ entry: "n1" })
  expect(done.ok).toBe(true)
  await Promise.resolve()
  const copy = (done.ok && (done.result as { entry: string }).entry) as string
  expect(lineup(home).indexOf(copy)).toBe(lineup(home).indexOf("n1") + 1)
  expect(state().folders[copy]).toMatchObject({ folderRole: "binder", title: "発表 2", pageType: SLIDE })
  expect(lineup(copy)).toHaveLength(2)
  expect(lineup(copy).some(id => lineup("n1").includes(id))).toBe(false)
  expect(lineup(copy).map(id => state().pages[id]?.title)).toEqual(lineup("n1").map(id => state().pages[id]?.title))
  expect(lineup(copy).map(id => state().pages[id]?.locked)).toEqual([undefined, undefined])

  // バインダの中のページは、そのバインダの中のすぐ後ろに写る
  const page = act({ entry: "s2" })
  expect(page.ok).toBe(true)
  await Promise.resolve()
  const made = (page.ok && (page.result as { entry: string }).entry) as string
  expect(lineup("n1")).toEqual(["s1", "s2", made])
  expect(state().pages[made]?.type).toBe(SLIDE)
})

test("書庫の行の右クリックのメニューは、ブックの外のバインダにも複製を出し、押すとすぐ後ろに写す", async () => {
  const store = withBinder()
  const state = () => store.state.getState()
  const center = state().window.screens.find(s => s.stages === undefined)?.id as string
  store.actions.makeScreenCurrent(center)
  const copy = "@matomezu/base:library-entry-duplicate"
  store.actions.openContextMenu(center, "@matomezu/base:library-entry-context", { entry: "n1" }, { x: 0, y: 0 })
  expect(isShown(store, state(), center, copy as never)).toBe(true)
  const home = Object.values(state().folders).find(f => f.folderRole === "home")?.id as string
  const before = state().folders[home]?.lineup.map(r => r.id) ?? []
  expect(
    (store.actions.command as (at: string, id: string, arg: unknown) => boolean)(center, copy, { entry: "n1" }),
  ).toBe(true)
  await Promise.resolve()
  const after = state().folders[home]?.lineup.map(r => r.id) ?? []
  expect(after).toHaveLength(before.length + 1)
  expect(state().folders[after[after.indexOf("n1") + 1] ?? ""]).toMatchObject({ folderRole: "binder", title: "発表 2" })
})

test("ブックの外のページ 1 枚の印刷プレビューの間に、そのページを開く（openPage）と印刷プレビューを閉じる", () => {
  const store = newStore({ newId: sequence() })
  store.receive({ ...worldRows(Object.values(store.state.getState().books), [drawingPage("x1")]), settings: {} }, [])
  const stage = store.actions.showOutsidePageStage("x1")
  store.actions.openPrintPreview(stage)
  expect(stageIn(store.state.getState().window, stage)?.mode.kind).toBe("print-preview")
  store.actions.openPage(stage, "other")
  expect(stageIn(store.state.getState().window, stage)?.mode.kind).toBe("print-preview")
  store.actions.openPage(stage, "x1")
  expect(stageIn(store.state.getState().window, stage)?.mode.kind).toBe("edit")
})
