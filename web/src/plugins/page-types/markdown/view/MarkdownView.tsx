// マークダウンのビュー（プレゼンテーション markdown）: プレゼンテーションのビューのレイヤー（book-content）が描く。ステージに紙は無く、ステージいっぱいにペインを並べ、ペインの中をふつうにスクロールする。
// 並べ方はステージごとの画面の状態（panes.ts。画面の場所に入れ、読み直しても戻す）: 左右か上下に 2 つ並べるか、1 つだけ見せる。いつも出る上の行の左端に、並べ方の 4 つのボタン（ソースだけ・左右・上下・
// プレビューだけ。コマンド）を並べ（選んでいなければ、ページを開いたとき本文があればプレビューだけ、空なら左右）、並べている間は、ペインごとに上辺にペインの名前の見出し（ページタブのような見た目）を出す。
// 見出しを掴んでもう片方のペインの上で離すと、2 つのペインを入れ替える（usePaneSwap）。境目は掴んで動かせ、ダブルクリックで真ん中に戻る（base の SplitHandle）。
// 入れ替えても要素の並びは変えず、CSS の order で見せる順を変える（ソースのペインのテキストFormのフォーカス・入力の途中・スクロールの位置を保つ）。
// 上の行・見出し・プレビューのペインの右クリックで、メニュー（pane-context。ページの設定・ブックの設定など）を開く。ソースのペインでは、文字の右クリックのままにする。
// ソースのペインでは原文を書ける（SourcePane.tsx）。描いた文書は、ページの原文を読んで（base の parseMarkdown）、段落の中の改行 1 つを利用者の設定の項目のとおりに見せ（soft-break.ts）、ページの紙の幅で、枠を付けずに紙の色の面に描き、下へいくらでも伸びる。
// 原文を読み直すのは、書くのを待たせないよう、画面とは別の処理の流れで読む（base の useMarkdownDocument）。ペインが紙より狭いときだけ、紙の幅のまま縮めて収める。両方のペインを並べている間は、ソースのペインをスクロールすると、描いた文書のペインがブロックごとに付いて行く（scroll-sync.ts）。
import { type MouseEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ItemPage } from "../../../../plugin-api"
import {
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useMessages,
  usePluginState,
  useSetPluginState,
  useShownPage,
  useStage,
  useUiCatalog,
  useUserSetting,
} from "../../../../plugin-api/ui"
import { type MarkdownDocument, paperSize, SOFT_BREAK, softBreakOf } from "../../../base"
import {
  GhostArea,
  MarkdownDocumentView,
  SEARCH_CURRENT_HIGHLIGHT,
  SEARCH_HIGHLIGHT,
  SplitHandle,
  useHighlightRanges,
  useMarkdownDocument,
  useResize,
  useSearchHits,
} from "../../../base/ui"
import { PANE_LAYOUT_COMMANDS } from "../commands"
import { kit } from "../kit"
import { PANE_CONTEXT } from "../markdown"
import {
  chosenWith,
  EVEN_PANE_SHARE,
  openingFor,
  PANE_LAYOUT_STATE,
  PANE_OPENING_STATE,
  PANES,
  type Pane,
  type PaneLayout,
  paneInputOf,
  paneLayoutOf,
  shareAt,
  shownPanes,
  splitOf,
  swapPanes,
} from "../panes"
import { type PageScroll, positionOf, remember, SCROLL_STATE, type Scrolls } from "../scroll-memory"
import { followScroll, type PaneMarks } from "../scroll-sync"
import { shrinkTo } from "../shrink"
import styles from "./MarkdownView.module.css"
import { SourcePane } from "./SourcePane"
import { renderedRanges, scrollToRange } from "./search-ranges"
import { usePaneSwap } from "./usePaneSwap"

const TITLES = { source: "Source", rendered: "Preview" } as const

// 描いているページがあるときだけ描く（outermost は、ステージで開いているステージエントリの id。ブックか、ブックの外のページ）
export function MarkdownView() {
  const page = useShownPage()
  const outermost = useStage()?.opened?.outermost.id
  return page && outermost !== undefined ? <MarkdownPage page={page} outermost={outermost} /> : null
}

function MarkdownPage({ page, outermost }: { page: ItemPage; outermost: string }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const shownPage = paneInputOf(page)
  const chosen = usePluginState(kit, PANE_LAYOUT_STATE)
  const opening = usePluginState(kit, PANE_OPENING_STATE)
  const layout = paneLayoutOf(chosen, opening, shownPage)
  const setChosen = useSetPluginState(kit, PANE_LAYOUT_STATE)
  const setOpening = useSetPluginState(kit, PANE_OPENING_STATE)
  // 入れ替えるときだけ first を書き、境目を動かすだけなら入れ替えていないまま
  const setLayout = (patch: Partial<PaneLayout>) => setChosen(chosenWith(chosen, layout, patch))
  const swap = usePaneSwap(() => setLayout({ first: swapPanes(layout).first }))
  const openMenu = useContextMenu(PANE_CONTEXT)
  const panes = useRef<HTMLDivElement>(null)
  const source = useRef<HTMLDivElement>(null)
  const rendered = useRef<HTMLDivElement>(null)
  const text = "text" in page && typeof page.text === "string" ? page.text : ""
  const document = useMarkdownDocument(text, page.id)
  // ページを開いたとき（替えたとき）に決めた並べ方を書く（本文を打っても決め直さない）
  const openedId = shownPage.id
  const openedText = shownPage.text
  // biome-ignore lint/correctness/useExhaustiveDependencies: 本文は開いたとき（ページが替わったとき）だけ読む
  useEffect(() => {
    const next = openingFor(opening, { id: openedId, text: openedText })
    if (next) setOpening(next)
  }, [openedId])
  const scrolls = usePluginState(kit, SCROLL_STATE)
  const setScrolls = useSetPluginState(kit, SCROLL_STATE)
  const memory = useScrollMemory(page.id, scrolls, next => setScrolls(next), source, rendered)
  const width = paperSize(catalog, page).w
  // ソースのペインのスクロールに、描いた文書のペインを付いて行かせる（片方だけ見せている間は、描いた文書のペインが無い）
  const follow = () => {
    const [from, to] = [source.current, rendered.current]
    memory.moved("source")
    if (!from || !to || memory.restoring()) return
    // ソースの目印は原文の中の始まりの位置を持ち、描いた文書の目印は並びの順に文書のブロックに当たる
    const written = marksOf(from, mark => Number(mark.getAttribute("data-markdown-block")))
    const drawn = marksOf(to, (_, i) => document.blocks[i]?.range.start ?? -1)
    to.scrollTop = followScroll(written, drawn, from.scrollTop)
  }
  const split = splitOf(layout.mode)
  const shown = shownPanes(layout)
  const menu = (e: MouseEvent) => openMenu(e, {})
  const drag = swap.drag
  return (
    <div className={styles.markdown} data-split={split}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける */}
      <div className={styles.bar} onContextMenu={menu}>
        <LayoutButtons />
      </div>
      <div ref={panes} className={styles.panes}>
        {PANES.filter(pane => shown.includes(pane)).map(pane => {
          const at = shown.indexOf(pane)
          const grow = split === "none" ? 1 : at === 0 ? layout.share : 1 - layout.share
          return (
            <section
              key={pane}
              ref={swap.section(pane)}
              className={styles.pane}
              data-pane={pane}
              data-drop={drag !== null && drag.pane !== pane && drag.over}
              aria-label={t(TITLES[pane])}
              style={{ order: at * 2, flexGrow: grow }}
            >
              {split !== "none" && (
                // biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける
                <div className={styles.heading} onContextMenu={menu}>
                  <span className={styles.tab} data-carried={drag?.pane === pane} {...swap.handlers(pane)}>
                    {t(TITLES[pane])}
                  </span>
                </div>
              )}
              {pane === "source" ? (
                <SourcePane
                  key={page.id}
                  outermost={outermost}
                  page={page.id}
                  text={text}
                  document={document}
                  scrollRef={source}
                  onScroll={follow}
                />
              ) : (
                <Rendered
                  page={page.id}
                  document={document}
                  width={width}
                  scrollRef={rendered}
                  onScroll={() => memory.moved("rendered")}
                  followHit={!shown.includes("source")}
                  onContextMenu={menu}
                />
              )}
            </section>
          )
        })}
        {split !== "none" && (
          <SplitHandle
            direction={split}
            frame={panes}
            onMove={(at, length) => setLayout({ share: shareAt(at, length, layout.share) })}
            onReset={() => setLayout({ share: EVEN_PANE_SHARE })}
            className={styles.splitter}
            data-pane-splitter
          />
        )}
      </div>
      {drag && (
        <GhostArea>
          <div className={styles.ghost} style={{ left: drag.x - drag.grab.x, top: drag.y - drag.grab.y }}>
            {t(TITLES[drag.pane])}
          </div>
        </GhostArea>
      )}
    </div>
  )
}

// 描いた文書のペインの中身: 紙の幅で描き、ペインが紙より狭いときだけ縮めて収める。
// 幅は小数まで測って切り捨てる（clientWidth の四捨五入で 1px 未満はみ出し、横のスクロールバーが出ないように）。
// 縮めても紙の色がペインの下まで届くよう、縮める前の高さを倍率で割って伸ばす
// 検索の当たりを光らせる（今の当たりは濃く）。ソースのペインを見せていなければ、今の当たりが見えるようにスクロールする（見せていれば、ソースのペインに付いて行く）
function Rendered({
  page,
  document,
  width,
  scrollRef: ref,
  onScroll,
  followHit,
  onContextMenu,
}: {
  page: string
  document: MarkdownDocument
  width: number | undefined
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
  followHit: boolean
  onContextMenu: (e: MouseEvent) => void
}) {
  const search = useSearchHits(page)
  const [lit, setLit] = useState<{ all: Range[]; current: Range[] }>({ all: [], current: [] })
  useLayoutEffect(() => {
    const root = ref.current
    const current = search.current === "none" ? [] : renderedRanges(root, document.blocks, [search.current])
    setLit({ all: renderedRanges(root, document.blocks, search.hits), current })
  }, [search, document, ref])
  useHighlightRanges(SEARCH_HIGHLIGHT, lit.all)
  useHighlightRanges(SEARCH_CURRENT_HIGHLIGHT, lit.current)
  const currentAt = search.current === "none" ? "none" : `${search.current.start}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: 今の当たりが替わったときだけスクロールする（光らせ直しでは動かさない）
  useEffect(() => {
    if (followHit) scrollToRange(ref.current, lit.current[0])
  }, [currentAt, lit.current.length > 0, followHit])
  const [room, setRoom] = useState(0)
  useResize(ref, () => {
    const el = ref.current
    if (el) setRoom(Math.floor(el.getBoundingClientRect().width - (el.offsetWidth - el.clientWidth)))
  })
  const zoom = width === undefined ? 1 : shrinkTo(room, width)
  const softBreak = softBreakOf(useUserSetting(SOFT_BREAK.id))
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける
    <div ref={ref} className={`${styles.scroll} ${styles.rendered}`} onScroll={onScroll} onContextMenu={onContextMenu}>
      <article className={styles.document} style={width ? { width, zoom, minHeight: `${100 / zoom}%` } : undefined}>
        <MarkdownDocumentView document={document} softBreak={softBreak} />
      </article>
    </div>
  )
}

// ページごとのスクロール位置の記憶（scroll-memory.ts）: ページを開いたとき（替えたとき）に覚えた位置へ戻し（覚えていなければ先頭）、スクロールしたら止まってから覚える。
// 戻したことで起きるソースのスクロールには、描いた文書のペインを付いて行かせない（restoring。別々に覚えた位置を戻すため）。ページを替えるときは、前のページの位置を先に覚える
const SAVE_AFTER_MS = 300
function useScrollMemory(
  page: string,
  scrolls: Scrolls | undefined,
  save: (next: Scrolls) => void,
  source: RefObject<HTMLDivElement | null>,
  rendered: RefObject<HTMLDivElement | null>,
) {
  const latest = useRef({ scrolls, save })
  latest.current = { scrolls, save }
  const pane = { source, rendered }
  const moving = useRef<{ page: string; tops: PageScroll } | null>(null) // まだ覚えていない動き
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoredByScroll = useRef(false) // 戻したことで起きるスクロールの知らせを待っている
  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const m = moving.current
    moving.current = null
    if (m) latest.current.save(remember(latest.current.scrolls, m.page, m.tops))
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: ページが替わったときだけ戻す（フックの中身は ref で読む）
  useLayoutEffect(() => {
    for (const name of PANES) {
      const el = pane[name].current
      if (!el) continue
      const to = positionOf(latest.current.scrolls, page, name)
      const before = el.scrollTop
      el.scrollTop = to
      if (name === "source" && el.scrollTop !== before) restoredByScroll.current = true
    }
    return flush
  }, [page])
  return {
    moved(name: Pane) {
      const el = pane[name].current
      if (!el) return
      moving.current = {
        page,
        tops: { ...(moving.current?.page === page ? moving.current.tops : {}), [name]: el.scrollTop },
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_AFTER_MS)
    },
    // 戻したことで起きたソースのスクロールか（1 回だけ true）
    restoring() {
      const was = restoredByScroll.current
      restoredByScroll.current = false
      return was
    },
  }
}

// スクロールするペイン el の、ブロックの目印（data-markdown-block）ごとの上端と、いちばん下までのスクロールの量（縮めた倍率も含めて、見えている位置で測る）。
// startOf は、目印（並びの i 番目）が当たるブロックの、原文の中の始まりの位置
function marksOf(el: HTMLElement, startOf: (mark: Element, i: number) => number): PaneMarks {
  const top = el.getBoundingClientRect().top - el.scrollTop
  const blocks = new Map<number, number>()
  for (const [i, mark] of [...el.querySelectorAll("[data-markdown-block]")].entries())
    blocks.set(startOf(mark, i), mark.getBoundingClientRect().top - top)
  return { blocks, end: el.scrollHeight - el.clientHeight }
}

// 上の行の右端の、並べ方の 4 つのボタン（今の並べ方のボタンは押した見た目）
function LayoutButtons() {
  const t = useMessages(kit)
  return (
    <div className={styles.layouts} role="toolbar" aria-label={t("Panes")}>
      {PANE_LAYOUT_COMMANDS.map(c => (
        <LayoutButton key={c.id} id={c.id} />
      ))}
    </div>
  )
}

function LayoutButton({ id }: { id: (typeof PANE_LAYOUT_COMMANDS)[number]["id"] }) {
  const t = useMessages(kit)
  const command = useCommand(id)
  const icon = useUiCatalog().commandIcons.get(id)
  const title = t(command.title)
  return (
    <button
      type="button"
      className={styles.layout}
      aria-label={title}
      title={title}
      aria-pressed={command.active}
      onClick={() => command.run()}
    >
      {icon ?? title}
    </button>
  )
}
