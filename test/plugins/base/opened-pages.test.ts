// 「開いている物のページの全部」（plugins/base/utils/opened-page.ts の openedPagesOf）
import { expect, test } from "bun:test"
import { openedPagesOf } from "../../../web/src/plugins/base/utils/opened-page"
import { commandContext } from "../../../web/src/store/commands"
import { SLIDE, testBinder, testPage } from "../../lineup"
import { newStore, sequence, worldRows } from "../../support"

test("ブックの外のバインダを開いたステージの「開いている物のページの全部」は、そのバインダの中の全部のページ", () => {
  const store = newStore({ newId: sequence() })
  const books = Object.values(store.state.getState().books)
  const n1 = testBinder("n1", "発表", SLIDE, testPage(SLIDE, "s1", { title: "表紙" }), testPage(SLIDE, "s2"))
  store.receive({ ...worldRows(books, [n1]), settings: {} }, [])
  const stage = store.actions.showOutsideBinderStage("n1", "s2")
  const ctx = commandContext(store.catalog.core, null, store.state.getState(), stage, "@matomezu/base:page-open")
  expect(ctx?.binder).toMatchObject({ kind: "binder", id: "n1" })
  expect(ctx && openedPagesOf(ctx).map(p => p.id)).toEqual(["s1", "s2"])
})
