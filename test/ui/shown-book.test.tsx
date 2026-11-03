// 見せ方が描くブック（useShownBook）: ブックの設定のダイアログの下書き（アイテムもページも指さないもの）だけを、そのブックの設定の項目に重ねる
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import type { Book } from "../../web/src/core/schema/book"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { createMatomezu } from "../../web/src/store/create"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { useShownBook } from "../../web/src/ui/view-hooks"
import { sequence } from "../support"

afterEach(cleanup)

const PAPER = "@matomezu/base:book-paper-color"

test("ブックを指す下書きは重なり、アイテムやページを指す下書きと、ほかのブックの下書きは重ならない（データは変えない）", () => {
  const instance = createMatomezu({
    plugins: BUILTIN_UI,
    home: "@matomezu/master:master",
    books: SAMPLE_BOOKS,
    lang: "ja",
    newId: sequence(),
  })
  instance.actions.openDialog("s1", "@matomezu/base:book-settings" as never, undefined as never)
  let shown: Book | null = null
  function Probe() {
    shown = useShownBook("s1")
    return null
  }
  const settingsOf = (book: Book | null) => (book as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  const paper = () => settingsOf(shown)[PAPER]
  render(
    <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
      <Probe />
    </MatomezuProvider>,
  )
  const draft = (preview: object) => {
    act(() => instance.actions.previewDialog({ book: "b1", ...preview } as never))
  }
  draft({ props: { [PAPER]: "#123456" } })
  expect(paper()).toBe("#123456")
  expect(settingsOf(instance.state.getState().books.b1 as Book)).not.toHaveProperty(PAPER)
  draft({ item: "x", props: { [PAPER]: "#123456" } })
  expect(paper()).toBeUndefined()
  draft({ page: "p1", props: { [PAPER]: "#123456" } })
  expect(paper()).toBeUndefined()
  draft({ book: "other", props: { [PAPER]: "#123456" } })
  expect(paper()).toBeUndefined()
})
