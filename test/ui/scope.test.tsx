// 描いている場所（ui/scope.tsx）: ステージの外で見るだけに描くページ（PageScope）の中は、置いたページのブックの物で描き、外がステージでも、その選択は写らず、中からは何も行えない。
// ダイアログの中は開いたステージが、無くなったステージを置いた所は何も行えない所が、描いている場所になる

import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { pagesOf } from "../../web/src/core/book"
import type { Book, PageOf } from "../../web/src/core/schema/book"
import { screenOf } from "../../web/src/core/window"
import { usePageLookStyle } from "../../web/src/plugins/base/book-look/use-page-look-style"
import { kit as baseKit } from "../../web/src/plugins/base/kit"
import { PRINT_MEASURES } from "../../web/src/plugins/base/print-preview/measures-state"
import { Printing } from "../../web/src/plugins/base/print-preview/printing"
import { SheetLayers } from "../../web/src/plugins/base/print-preview/SheetLayers"
import { WIDE_SEARCH_MODE } from "../../web/src/plugins/base/wide-search/state"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { useCommand } from "../../web/src/ui/commands"
import { useContextMenu } from "../../web/src/ui/context-menu"
import { useMenuCommand } from "../../web/src/ui/menu"
import { ActsOnScope, PageScope, StageScope } from "../../web/src/ui/scope"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import {
  useActions,
  useAllowed,
  usePage,
  usePerform,
  usePluginState,
  useSetPluginState,
  useStage,
  useStageArea,
  useStagePan,
} from "../../web/src/ui/view-hooks"
import { type DRAWING, drawingPage, testBook } from "../lineup"

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

const drawing = (id: string, settings?: PageOf<typeof DRAWING>["settings"]) =>
  testBook(id, id, [
    drawingPage(`p${id}`, {
      title: "P",
      ...(settings ? { settings } : {}),
      items: [
        box("a", 40),
        box("b", 400),
        { id: "l1", item: "@matomezu/line:connector-line", from: "a", to: "b", props: {} },
      ],
    }),
  ])

// x はテーマと線の引き方を選んだブック、y は何も選んでいないブック（ページ px・py に、同じ id の箱と線がある）
const X = drawing("x", { "@matomezu/base:page-theme": "sticky", "@matomezu/line:line-route": "straight" })
const Y = drawing("y")

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
  const bookOf = (id: string) => instance.state.getState().books[id] as Book
  return { instance, wrap, bookOf }
}

const SIZE = { w: 1123, h: 794 }

// 描いている場所のブックの 1 枚目のページを描く（ブックの見た目の CSS 変数も付ける）
function Sheet({ book }: { book: ReturnType<ReturnType<typeof setup>["bookOf"]> }) {
  const look = usePageLookStyle()
  return (
    <div data-sheet style={look}>
      <Printing>
        <SheetLayers book={book} page={pagesOf(book)[0]!} column={0} row={0} paper={SIZE} />
      </Printing>
    </div>
  )
}

test("ステージが別のブックを開いて物を選んでいても、ステージの外で見るだけに描くページは、置いたページのブックのテーマと線の引き方で、ステージで開いたときと同じに描き、選択は写らない", () => {
  const { instance, wrap, bookOf } = setup()
  const x = bookOf("x")
  // ステージで x を開き、何も選ばずに描いた物
  act(() => instance.actions.openBook("s1", "x"))
  const opened = render(
    wrap(
      <StageScope stage="s1">
        <Sheet book={x} />
      </StageScope>,
    ),
  )
  const expected = opened.container.innerHTML
  expect(expected).toContain("data-selected")
  cleanup()
  // ステージは y を開き、同じ id の線と箱を選んでいる。その中に、x のページを見るだけに描く
  act(() => instance.actions.openBook("s1", "y"))
  act(() => instance.actions.select("s1", ["l1", "a"]))
  const drawn = render(
    wrap(
      <StageScope stage="s1">
        <PageScope book="x" page="px" zoom={1}>
          <Sheet book={x} />
        </PageScope>
      </StageScope>,
    ),
  )
  expect(drawn.container.innerHTML).toBe(expected)
  expect(drawn.container.querySelector('[data-selected="true"]')).toBeNull()
})

// 中で、操作のフックを全部呼ぶ物（結果を seen に残す）
interface Seen {
  stage: ReturnType<typeof useStage>
  page: string | undefined
  allowed: ReturnType<typeof useAllowed>
  done: unknown
  command: boolean
  screenCommand: boolean
  menu: string | null
  state: unknown
  pan: unknown
}
function probeOf(seen: { now: Seen | null }) {
  return function Probe() {
    const view = useStage()
    const page = usePage()
    const allowed = useAllowed("@matomezu/paper:item-update")
    const perform = usePerform()
    const fit = useCommand("@matomezu/base:zoom-fit") // ステージから呼ぶコマンド
    const settings = useCommand("@matomezu/base:settings-open") // スクリーンから呼ぶコマンド
    const menu = useMenuCommand("@matomezu/base:zoom-fit" as never)
    const openMenu = useContextMenu("@matomezu/base:page-context")
    const actions = useActions()
    const setState = useSetPluginState(baseKit, PRINT_MEASURES)
    const setWindowState = useSetPluginState(baseKit, WIDE_SEARCH_MODE) // 窓の範囲の宣言
    useStageArea({ w: 5000, h: 5000 })
    seen.now = {
      stage: view,
      page: (page as { id?: string } | null)?.id,
      allowed,
      done:
        seen.now?.done ??
        perform("@matomezu/paper:item-update", { item: "a", props: { caption: "変えた" } } as never, { page: "px" }),
      command: fit.shown,
      screenCommand: settings.shown,
      menu,
      state: usePluginState(baseKit, PRINT_MEASURES),
      pan: useStagePan(),
    }
    return (
      <button
        type="button"
        data-probe
        onClick={() => {
          actions.select(["a"])
          actions.zoomStage(3)
          actions.openDialog("@matomezu/base:book-settings" as never, undefined as never)
          setState({ book: "x", pages: {} })
          setWindowState("words")
          actions.showToast({ kind: "info", message: baseKit.message("Applied") })
          fit.run()
          settings.run()
        }}
        onContextMenu={e => openMenu(e, { page: "py" } as never)}
      >
        probe
      </button>
    )
  }
}
const press = (container: HTMLElement) => {
  const el = container.querySelector<HTMLElement>("[data-probe]")!
  act(() => el.click())
  act(() => {
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))
  })
}

test("ステージの中に置いたステージの外で見るだけに描くページの中では、ステージも道具も無く、コマンドは（ステージのコマンドもスクリーンのコマンドも）出ず、何を行っても何も変わらない", () => {
  const { instance, wrap } = setup()
  act(() => instance.actions.openBook("s1", "y"))
  act(() => instance.actions.select("s1", ["b"]))
  const seen: { now: Seen | null } = { now: null }
  const Probe = probeOf(seen)
  const { container } = render(
    wrap(
      <StageScope stage="s1">
        <PageScope book="x" page="px" zoom={0.5}>
          <Probe />
        </PageScope>
      </StageScope>,
    ),
  )
  expect(seen.now).toEqual({
    stage: null,
    page: "px", // 読む物は、置いたページ
    allowed: { ok: false, permission: null },
    done: { ok: false, reason: "no-book" },
    command: false,
    screenCommand: false,
    menu: null,
    state: undefined,
    pan: null,
  })
  const before = instance.state.getState()
  press(container)
  const after = instance.state.getState()
  expect(after.window).toBe(before.window)
  expect(after.books).toBe(before.books)
  expect(after.pluginValues).toBe(before.pluginValues)
  expect(after.toasts).toBe(before.toasts)
  expect(after.dialog).toBeNull()
  expect(after.contextMenu ?? null).toBeNull()
})

test("同じ物をステージの中に置けば、ステージが開いているページを読み、コマンドが出て、操作はそのステージに向く", () => {
  const { instance, wrap } = setup()
  act(() => instance.actions.openBook("s1", "y"))
  const seen: { now: Seen | null } = { now: null }
  const Probe = probeOf(seen)
  const { container } = render(
    wrap(
      <StageScope stage="s1">
        <Probe />
      </StageScope>,
    ),
  )
  expect(seen.now).toMatchObject({ page: "py", command: true, screenCommand: true })
  expect(seen.now?.stage?.opened).toMatchObject({ book: "y", page: "py" })
  act(() => container.querySelector<HTMLElement>("[data-probe]")!.click())
  const stage = screenOf(instance.state.getState().window).stages[0]!
  expect(stage.selection).toEqual(["a"])
})

test("ダイアログなどを開いた場所を置くと、中のフックは、開いたステージのページを読む。無くなったステージを置いた所からは、何も行えない", () => {
  const { instance, wrap } = setup()
  act(() => instance.actions.openBook("s1", "y"))
  const seen: { now: Seen | null } = { now: null }
  const Probe = probeOf(seen)
  render(
    wrap(
      <ActsOnScope at="s1">
        <Probe />
      </ActsOnScope>,
    ),
  )
  expect(seen.now).toMatchObject({ page: "py", command: true })
  cleanup()
  const gone: { now: Seen | null } = { now: null }
  const Gone = probeOf(gone)
  const { container } = render(
    wrap(
      <StageScope stage="no-such-stage">
        <Gone />
      </StageScope>,
    ),
  )
  expect(gone.now).toMatchObject({
    stage: null,
    page: undefined,
    allowed: { ok: false, permission: null },
    done: { ok: false, reason: "no-book" },
    command: false,
    screenCommand: false,
  })
  const before = instance.state.getState()
  press(container)
  expect(instance.state.getState().window).toBe(before.window)
  expect(instance.state.getState().dialog).toBeNull()
  cleanup()
  // ダイアログなどを開いたステージが、もう無いとき（スクリーンのコマンドも出ない）
  const closed: { now: Seen | null } = { now: null }
  const Closed = probeOf(closed)
  render(
    wrap(
      <ActsOnScope at="no-such-stage">
        <Closed />
      </ActsOnScope>,
    ),
  )
  expect(closed.now).toMatchObject({ stage: null, page: undefined, command: false, screenCommand: false })
  expect(closed.now?.done).toEqual({ ok: false, reason: "no-book" })
})

test("スクリーンを開いた場所に置くと、スクリーンのコマンドは出て、ステージのコマンドは出ない。窓（ステージを持たずに開いた印）も同じ", () => {
  const { instance, wrap } = setup()
  const screen = instance.state.getState().window.screens[0]!.id
  for (const at of [screen, "none"]) {
    const seen: { now: Seen | null } = { now: null }
    const Probe = probeOf(seen)
    render(
      wrap(
        <ActsOnScope at={at}>
          <Probe />
        </ActsOnScope>,
      ),
    )
    expect(seen.now).toMatchObject({ stage: null, page: undefined, command: false, screenCommand: true })
    cleanup()
  }
})
