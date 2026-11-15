// スクラップのビュー（base/scrap/ScrapView）: 指したページを、そのブックの物で、範囲 × 倍率の枠に描く。指す先が無ければ枠だけを描く

import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { pagesOf } from "../../../web/src/core/book"
import { ScrapView } from "../../../web/src/plugins/base/scrap/ScrapView"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { pagesBook, withPages } from "../../lineup"

afterEach(cleanup)

const box = (id: string, x: number) => ({
  id,
  item: "@matomezu/box:shape-nest-box",
  x,
  y: 40,
  w: 160,
  h: 80,
  props: { caption: id },
})

const drawing = (id: string, settings: object) =>
  pagesBook({
    type: "@matomezu/drawing:drawing",
    id,
    title: id,
    settings,
    pages: [
      {
        id: `p${id}`,
        title: "P",
        paper: "@matomezu/base:a4",
        orientation: "landscape",
        items: [
          box("a", 40),
          box("b", 400),
          { id: "l1", item: "@matomezu/line:connector-line", from: "a", to: "b", props: {} },
        ],
      },
    ],
  })

// x はテーマと線の引き方を選んだブック、y は何も選んでいないブック（ページ px・py に、同じ id の箱と線がある）
const X = drawing("x", { "@matomezu/base:page-theme": "sticky", "@matomezu/line:line-route": "straight" })
const Y = drawing("y", {})

function setup(extra: readonly object[] = []) {
  const instance = createMatomezu({
    plugins: BUILTIN_UI,
    controlCenter: "@matomezu/control-center:control-center",
    books: [],
    savedBooks: [X, Y, ...extra],
    lang: "ja",
  })
  instance.actions.resizeStage("s1", { w: 1400, h: 1000 })
  const wrap = (node: React.ReactNode) => (
    <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
      {node}
    </MatomezuProvider>
  )
  return { instance, wrap }
}

describe("スクラップの中（ScrapView）", () => {
  test("指したページを、そのブックの物で、範囲 × 倍率の枠に描く。ステージが開いているブックや選択は写らない", () => {
    const { instance, wrap } = setup()
    act(() => instance.actions.openBook("s1", "y"))
    act(() => instance.actions.select("s1", ["l1"]))
    const { container } = render(
      wrap(<ScrapView scrap={{ page: "px", area: { x: 20, y: 30, w: 400, h: 200 }, scale: 0.5 }} />),
    )
    const frame = container.querySelector<HTMLElement>('[data-scrap="shown"]')!
    expect([frame.style.width, frame.style.height]).toEqual(["200px", "100px"])
    expect(frame.querySelector('svg [data-selected="false"]')).not.toBeNull()
    expect(frame.querySelector('[data-selected="true"]')).toBeNull()
    expect(frame.innerHTML).toContain("translate(-20px, -30px)")
  })

  test("指したページが無いか、同じ id のページが 2 つのブックにあれば、枠だけを描く（無い）", () => {
    const twin = (id: string) => withPages({ ...Y, id }, [{ ...pagesOf(Y)[0]!, id: "twin" }])
    const { wrap } = setup([twin("t1"), twin("t2")])
    const { container } = render(
      wrap(
        <>
          <ScrapView scrap={{ page: "twin", area: { x: 0, y: 0, w: 100, h: 50 }, scale: 1 }} />
          <ScrapView scrap={{ page: "nothing", area: { x: 0, y: 0, w: 100, h: 50 }, scale: 1 }} />
        </>,
      ),
    )
    expect(container.querySelectorAll('[data-scrap="none"]')).toHaveLength(2)
  })

  test("可変ページの中身を右・下へずらしたら、ずらした印刷区画の分だけ先を描く", () => {
    const shiftedBook = withPages({ ...X, id: "g" }, [
      { ...pagesOf(X)[0]!, id: "pg", grows: "all", shift: { x: 1, y: 2 } },
    ])
    const { wrap } = setup([shiftedBook])
    const { container } = render(
      wrap(<ScrapView scrap={{ page: "pg", area: { x: 20, y: 30, w: 400, h: 200 }, scale: 1 }} />),
    )
    // A4 横の紙（1123 × 794）の 1 枚右・2 枚下
    expect(container.innerHTML).toContain(`translate(-${20 + 1123}px, -${30 + 2 * 794}px)`)
  })
})
