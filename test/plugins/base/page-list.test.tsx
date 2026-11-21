// ページ一覧（ステージの左の縦の列）: ページ一覧を選んだタイプ（スライド）のページにだけ出て、ページタブは出さない。押したページを開く
import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { createBookIn } from "../../../web/src/plugins/base"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"
import { showFirstBook } from "../../support"

afterEach(cleanup)

type Perform = {
  perform(id: string, a: object, on: { book: string }): { ok: boolean }
}

function open(type: string) {
  const instance = createMatomezu({
    plugins: BUILTIN_UI,
    partial: true,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
  })
  showFirstBook(instance)
  render(
    <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  act(() => {
    createBookIn(instance, "s1", { title: "ブック" })
  })
  const book = Object.keys(instance.state.getState().books)[0] as string
  // まとまるタイプ（スライド）は、1 枚目で「スライド」のバインダを作り、2 枚目はその中に足す
  let binder: string | undefined
  const add = (title: string) =>
    act(() => {
      const slide = type === "@matomezu/slide-book:slide"
      const into = !slide ? {} : binder === undefined ? { into: { newBinder: "スライド" } } : { into: { binder } }
      const done = (instance.actions as unknown as Perform).perform(
        "@matomezu/base:page-add",
        { type, title, ...into },
        { book },
      ) as { ok: boolean; result?: { binder?: string } }
      if (slide && binder === undefined) binder = done.result?.binder
    })
  add("一枚目")
  add("二枚目")
  return { instance }
}

describe("ページ一覧", () => {
  test("スライドのバインダを開いている間は出て、ページタブにはバインダが 1 つのタブで出る。押したページを開く", () => {
    open("@matomezu/slide-book:slide")
    expect(document.querySelector("[data-page-list]")).not.toBeNull()
    expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["スライド"])
    const pages = () => screen.getAllByRole("button", { name: /一枚目|二枚目/ })
    expect(pages()).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "一枚目" }))
    expect(screen.getByRole("button", { name: "一枚目" }).getAttribute("aria-current")).toBe("page")
  })

  test("バインダに入らないタイプ（図面）のページを開いている間は出ず、ページタブが出る", () => {
    open("@matomezu/drawing:drawing")
    expect(document.querySelector("[data-page-list]")).toBeNull()
    expect(screen.getAllByRole("tab").length).toBeGreaterThan(0)
  })
})
