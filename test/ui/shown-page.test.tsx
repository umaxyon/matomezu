// 見せ方が描くページ（useShownPage）: ダイアログの下書きを、ページのアイテムにも、どの深さの子の形にも重ねる
import { afterEach, expect, test } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import { findShape, type ItemPage } from "../../web/src/core/placed"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { useShownPage } from "../../web/src/ui/view-hooks"
import { SAMPLE_BOOKS } from "../sample-books"
import { sequence } from "../support"

afterEach(cleanup)

const NEST = "@matomezu/box:shape-nest-box"
const LIST = "@matomezu/list:shape-list"

test("内包ボックスの中のリストの設定ダイアログの下書きは、子の形に重なる（データは変えない）", () => {
  const instance = createMatomezu({
    plugins: BUILTIN_UI,
    home: "@matomezu/master:master",
    books: SAMPLE_BOOKS,
    lang: "ja",
    newId: sequence(),
  })
  instance.actions.resizeStage("s1", { w: 1400, h: 1000 })
  const place = (args: object) => {
    const done = instance.actions.perform(
      "@matomezu/paper:item-place" as never,
      { page: "p1", w: 200, h: 100, ...args } as never,
      { book: "b1" },
    )
    if (!done.ok) throw new Error(JSON.stringify(done))
    return (done as { result: { item: string } }).result.item
  }
  const parent = place({ item: NEST, at: { x: 40, y: 40 }, w: 400, h: 300 })
  const child = place({ item: LIST, at: { x: 0, y: 0 }, parent, w: 240, h: 120, props: { caption: "前" } })
  instance.actions.openDialog("s1", "@matomezu/list:list-edit" as never, { page: "p1", item: child } as never)
  instance.actions.previewDialog({ book: "b1", item: child, props: { caption: "下書き" } })
  let shown: ItemPage | null = null
  function Probe() {
    shown = useShownPage("s1")
    return null
  }
  render(
    <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
      <Probe />
    </MatomezuProvider>,
  )
  const caption = (page: ItemPage | null) => (findShape(page!, child)!.shape.props as { caption: string }).caption
  expect(caption(shown)).toBe("下書き")
  expect(caption((instance.state.getState().books.b1 as unknown as { pages: ItemPage[] }).pages[0]!)).toBe("前")
})
