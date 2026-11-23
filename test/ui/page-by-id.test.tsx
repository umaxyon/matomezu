// usePageById・useItem: 描いている場所のステージが開いている物の中のページ（とそのアイテム）を id で引く。開いている物の外のページ（ほかのブックのページ）は引けず、何も開いていなければ無い

import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { NO_PAGE } from "../../web/src/core/stage"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { PageScope, StageScope } from "../../web/src/ui/scope"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { useItem, usePageById } from "../../web/src/ui/view-hooks"
import { drawingPage, testBook } from "../lineup"
import { showFirstBook } from "../support"

afterEach(cleanup)

const X = testBook("x", "エックス", [drawingPage("px1", { title: "一" }), drawingPage("px2", { title: "二" })])
const Y = testBook("y", "ワイ", [drawingPage("py", { title: "ワイの" })])

function setup() {
  const instance = createMatomezu({
    plugins: BUILTIN_UI,
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: [X, Y],
    lang: "ja",
  })
  const titles: (string | null)[] = []
  function Probe({ id }: { id: string }) {
    const page = usePageById(id)
    titles.push(page === NO_PAGE ? null : page.title)
    return null
  }
  const draw = (node: React.ReactNode) =>
    render(
      <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
        {node}
      </MatomezuProvider>,
    )
  return { instance, titles, Probe, draw }
}

test("ステージが開いているブックの中のページは、開いて見せているページでなくても引け、ほかのブックのページは引けない", () => {
  const { instance, titles, Probe, draw } = setup()
  act(() => showFirstBook(instance))
  draw(
    <StageScope stage="s1">
      <Probe id="px2" />
      <Probe id="py" />
    </StageScope>,
  )
  expect(titles).toEqual(["二", null])
})

test("ステージが無い・何も開いていなければ、どのページも引けない", () => {
  const { titles, Probe, draw } = setup()
  draw(
    <StageScope stage="s1">
      <Probe id="px1" />
    </StageScope>,
  )
  expect(titles).toEqual([null])
})

test("ステージの外で見るだけに描くページの中は、置いたページのブックの中のページを引く", () => {
  const { instance, titles, Probe, draw } = setup()
  act(() => showFirstBook(instance))
  draw(
    <StageScope stage="s1">
      <PageScope outermost="y" page="py" zoom={1}>
        <Probe id="py" />
        <Probe id="px1" />
      </PageScope>
    </StageScope>,
  )
  expect(titles).toEqual(["ワイの", null])
})

test("useItem も、引けるのは開いている物の中のページのアイテムだけ（ほかのブックのページのアイテムは引けない）", () => {
  const item = { id: "n1", item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: { caption: "箱" } }
  const A = testBook("x", "エックス", [drawingPage("px1", { items: [item] })])
  const B = testBook("y", "ワイ", [drawingPage("py", { items: [{ ...item, id: "n2" }] })])
  const instance = createMatomezu({
    plugins: BUILTIN_UI,
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: [A, B],
    lang: "ja",
  })
  const got: (string | null)[] = []
  function Probe({ page, id }: { page: string; id: string }) {
    got.push(useItem(page, id)?.id ?? null)
    const found = usePageById(page)
    got.push(found === NO_PAGE ? null : found.id)
    return null
  }
  act(() => showFirstBook(instance))
  render(
    <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
      <StageScope stage="s1">
        <Probe page="px1" id="n1" />
        <Probe page="py" id="n2" />
      </StageScope>
    </MatomezuProvider>,
  )
  expect(got).toEqual(["n1", "px1", null, null])
})
