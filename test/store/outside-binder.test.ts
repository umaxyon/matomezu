// ブックの外のバインダを窓に出す（store の showOutsideBinderStage・openOutsideBinder・openToStage）: 開く・ページを替える・中のページを変える・元に戻す・ロック
import { expect, test } from "bun:test"
import { stageIn } from "../../web/src/core/window"
import { NO_STAGE } from "../../web/src/store/dialogs"
import { openedIn } from "../../web/src/store/store"
import { SLIDE, testBinder, testPage } from "../lineup"
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
