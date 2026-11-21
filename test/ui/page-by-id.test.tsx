// usePageById: 描いている場所のステージが開いている物の中のページを id で引く。開いている物の外のページ（ほかのブックのページ）は引けず、何も開いていなければ無い

import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { PageScope, StageScope } from "../../web/src/ui/scope"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { usePageById } from "../../web/src/ui/view-hooks"
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
    titles.push(usePageById(id)?.title ?? null)
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
      <PageScope book="y" page="py" zoom={1}>
        <Probe id="py" />
        <Probe id="px1" />
      </PageScope>
    </StageScope>,
  )
  expect(titles).toEqual(["ワイの", null])
})
