// 描いているページ（ui/drawn.tsx）: ステージの外で、窓に無い id にページを結んで描くと、ステージが開いているブックでなく、結んだページのブックの物で描く。
// ステージの選択は中に写らず、中からは何も行わない
import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { pagedOf } from "../../web/src/core/book"
import type { Book } from "../../web/src/core/schema/book"
import { useBookLookStyle } from "../../web/src/plugins/base/book-look/use-book-look-style"
import { kit as baseKit } from "../../web/src/plugins/base/kit"
import { PRINT_MEASURES } from "../../web/src/plugins/base/print-preview/measures-state"
import { Printing } from "../../web/src/plugins/base/print-preview/printing"
import { SheetLayers } from "../../web/src/plugins/base/print-preview/SheetLayers"
import { ScrapView } from "../../web/src/plugins/base/scrap/ScrapView"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { useCommand } from "../../web/src/ui/commands"
import { useContextMenu } from "../../web/src/ui/context-menu"
import { DrawnScope } from "../../web/src/ui/drawn"
import { MatomezuProvider, useCatalog } from "../../web/src/ui/store-context"
import {
  useAllowed,
  usePerform,
  usePluginState,
  useStage,
  useStageArea,
  useStagePan,
} from "../../web/src/ui/view-hooks"

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

const drawing = (id: string, settings: object) => ({
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
const X = drawing("x", { "@matomezu/base:book-theme": "sticky", "@matomezu/line:line-route": "straight" })
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
  const bookOf = (id: string) => pagedOf(instance.state.getState().books[id] as Book)!
  return { instance, wrap, bookOf }
}

const SIZE = { w: 1123, h: 794 }

// ステージの id で、そのステージのブックの 1 枚目のページを描く（ブックの見た目の CSS 変数も付ける）
function Sheet({ stage, book }: { stage: string; book: ReturnType<ReturnType<typeof setup>["bookOf"]> }) {
  const look = useBookLookStyle(stage, book.type)
  return (
    <div data-sheet style={look}>
      <Printing>
        <SheetLayers stage={stage} book={book} page={book.pages[0]!} column={0} row={0} paper={SIZE} />
      </Printing>
    </div>
  )
}

function Drawn({ book }: { book: ReturnType<ReturnType<typeof setup>["bookOf"]> }) {
  const catalog = useCatalog().core
  return (
    <DrawnScope catalog={catalog} book={book} page={book.pages[0]!} zoom={1}>
      {stage => <Sheet stage={stage} book={book} />}
    </DrawnScope>
  )
}

test("ステージが別のブックを開いて物を選んでいても、結んだページのブックのテーマと線の引き方で、ステージで開いたときと同じに描き、選択は写らない", () => {
  const { instance, wrap, bookOf } = setup()
  const x = bookOf("x")
  // ステージで x を開き、何も選ばずに描いた物
  act(() => instance.actions.openBook("s1", "x"))
  const opened = render(wrap(<Sheet stage="s1" book={x} />))
  const expected = opened.container.innerHTML
  expect(expected).toContain("data-selected")
  cleanup()
  // ステージは y を開き、同じ id の線と箱を選んでいる
  act(() => instance.actions.openBook("s1", "y"))
  act(() => instance.actions.select("s1", ["l1", "a"]))
  const drawn = render(wrap(<Drawn book={x} />))
  expect(drawn.container.innerHTML).toBe(expected)
  expect(drawn.container.querySelector('[data-selected="true"]')).toBeNull()
})

test("描いているページでは、ステージは選択も道具も無く、アクションは行えず、行っても何も変わらない", () => {
  const { instance, wrap, bookOf } = setup()
  act(() => instance.actions.openBook("s1", "y"))
  act(() => instance.actions.select("s1", ["a"]))
  const x = bookOf("x")
  let seen: { stage: ReturnType<typeof useStage>; allowed: ReturnType<typeof useAllowed>; done: unknown } | null = null
  function Probe({ stage }: { stage: string }) {
    const view = useStage(stage)
    const allowed = useAllowed(stage, "@matomezu/paper:item-update")
    const perform = usePerform(stage)
    seen = {
      stage: view,
      allowed,
      done:
        seen?.done ??
        perform("@matomezu/paper:item-update", { page: "px", item: "a", props: { caption: "変えた" } } as never),
    }
    return null
  }
  function Scope() {
    const catalog = useCatalog().core
    return (
      <DrawnScope catalog={catalog} book={x} page={x.pages[0]!} zoom={0.5}>
        {stage => <Probe stage={stage} />}
      </DrawnScope>
    )
  }
  render(wrap(<Scope />))
  const got = seen!
  expect(got.stage).toMatchObject({
    opened: { book: "x", page: "px" },
    zoom: 0.5,
    selection: [],
    tool: null,
    editing: false,
  })
  expect(got.allowed).toEqual({ ok: false, permission: null })
  expect(got.done).toEqual({ ok: false, reason: "no-book" })
  const a = pagedOf(instance.state.getState().books.x as Book)!.pages[0]!.items![0] as { props: { caption: string } }
  expect(a.props.caption).toBe("a")
})

test("描いているページの id には、コマンドは出ず、選択・広さ・右クリックのメニューは窓を変えない", () => {
  const { instance, wrap, bookOf } = setup()
  act(() => instance.actions.openBook("s1", "y"))
  const x = bookOf("x")
  let id = ""
  let shown: Record<string, boolean> = {}
  function Probe({ stage }: { stage: string }) {
    id = stage
    const inStage = useCommand("s1", "@matomezu/base:zoom-fit")
    const inDrawn = useCommand(stage, "@matomezu/base:zoom-fit")
    useStageArea(stage, { w: 5000, h: 5000 })
    const menu = useContextMenu(stage, "@matomezu/base:page-context")
    shown = { inStage: inStage.shown, inDrawn: inDrawn.shown }
    return (
      <button type="button" data-menu onContextMenu={e => menu(e, { page: "py" } as never)}>
        menu
      </button>
    )
  }
  function Scope() {
    const catalog = useCatalog().core
    return (
      <DrawnScope catalog={catalog} book={x} page={x.pages[0]!} zoom={1}>
        {stage => <Probe stage={stage} />}
      </DrawnScope>
    )
  }
  const before = instance.state.getState().window
  const { container } = render(wrap(<Scope />))
  expect(shown).toEqual({ inStage: true, inDrawn: false })
  act(() => instance.actions.select(id, ["a"]))
  act(() => {
    container.querySelector<HTMLElement>("[data-menu]")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))
  })
  expect(instance.state.getState().window).toBe(before)
  expect(instance.state.getState().contextMenu ?? null).toBeNull()
})

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
    const twin = (id: string) => ({ ...Y, id, pages: [{ ...Y.pages[0]!, id: "twin" }] })
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
    const shiftedBook = { ...X, id: "g", pages: [{ ...X.pages[0]!, id: "pg", grows: "all", shift: { x: 1, y: 2 } }] }
    const { wrap } = setup([shiftedBook])
    const { container } = render(
      wrap(<ScrapView scrap={{ page: "pg", area: { x: 20, y: 30, w: 400, h: 200 }, scale: 1 }} />),
    )
    // A4 横の紙（1123 × 794）の 1 枚右・2 枚下
    expect(container.innerHTML).toContain(`translate(-${20 + 1123}px, -${30 + 2 * 794}px)`)
  })
})

test("描いているページの id には、ステージごとのプラグイン状態もパンも無く、書いても何も変わらない", () => {
  const { instance, wrap, bookOf } = setup()
  act(() => instance.actions.openBook("s1", "y"))
  const x = bookOf("x")
  let seen: { state: unknown; pan: unknown } | null = null
  let id = ""
  function Probe({ stage }: { stage: string }) {
    id = stage
    seen = { state: usePluginState(baseKit, PRINT_MEASURES, stage), pan: useStagePan(stage) }
    return null
  }
  function Scope() {
    const catalog = useCatalog().core
    return (
      <DrawnScope catalog={catalog} book={x} page={x.pages[0]!} zoom={1}>
        {stage => <Probe stage={stage} />}
      </DrawnScope>
    )
  }
  render(wrap(<Scope />))
  expect(seen!).toEqual({ state: undefined, pan: null })
  const before = instance.state.getState().pluginValues
  act(() => instance.setPluginState(PRINT_MEASURES.id, id, { book: "x", pages: {} }))
  expect(instance.state.getState().pluginValues).toBe(before)
})
