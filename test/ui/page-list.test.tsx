// ページ一覧（ステージの左の縦の列）: ページ一覧を選んだタイプ（スライドのブック）のブックにだけ出て、ページタブは出さない。押したページを開く
import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createBookIn } from "../../web/src/plugins/base"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { WindowRoot } from "../../web/src/ui/WindowRoot"

afterEach(cleanup)

type Perform = {
  perform(id: string, a: object, on: { book: string }): { ok: boolean }
}

function open(type: string) {
  const instance = createMatomezu({
    plugins: BUILTIN_UI,
    partial: true,
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  render(
    <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  act(() => {
    createBookIn(instance, "s1", { title: "ブック" })
  })
  const book = Object.keys(instance.state.getState().books)[0] as string
  const add = (title: string) =>
    act(() => {
      ;(instance.actions as unknown as Perform).perform("@matomezu/base:page-add", { title }, { book })
    })
  add("一枚目")
  add("二枚目")
  return { instance }
}

describe("ページ一覧", () => {
  test("スライドのブックには出て、ページタブは出ない。押したページを開く", () => {
    open("@matomezu/slide-book:slide")
    expect(document.querySelector("[data-page-list]")).not.toBeNull()
    expect(screen.queryAllByRole("tab")).toHaveLength(0)
    const pages = () => screen.getAllByRole("button", { name: /一枚目|二枚目/ })
    expect(pages()).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "一枚目" }))
    expect(screen.getByRole("button", { name: "一枚目" }).getAttribute("aria-current")).toBe("page")
  })

  test("一覧を選んでいないタイプ（図面）には出ず、ページタブが出る", () => {
    open("@matomezu/drawing:drawing")
    expect(document.querySelector("[data-page-list]")).toBeNull()
    expect(screen.getAllByRole("tab").length).toBeGreaterThan(0)
  })
})
