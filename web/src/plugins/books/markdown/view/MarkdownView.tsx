// マークダウンのビュー（見せ方 markdown）: ブックのビューのレイヤー（book-content）が描く。ステージに紙は無く、ステージいっぱいにペインを並べ、ペインの中をふつうにスクロールする。
// 並べ方はステージごとの画面の状態（panes.ts。画面の場所に入れ、読み直しても戻す）: 左右か上下に 2 つ並べるか、1 つだけ見せる。いつも出る上の行の左端に、並べ方の 4 つのボタン（ソースだけ・左右・上下・
// プレビューだけ。コマンド）を並べ（選んでいなければ、ページを開いたとき本文があればプレビューだけ、空なら左右）、並べている間は、ペインごとに上辺にペインの名前の見出し（ページタブのような見た目）を出す。
// 見出しを掴んでもう片方のペインの上で離すと、2 つのペインを入れ替える（usePaneSwap）。境目は掴んで動かせ、ダブルクリックで真ん中に戻る（base の SplitHandle）。
// 入れ替えても要素の並びは変えず、CSS の order で見せる順を変える（ソースのペインのテキストFormのフォーカス・入力の途中・スクロールの位置を保つ）。
// 上の行・見出し・プレビューのペインの右クリックで、メニュー（pane-context。ページの設定・ブックの設定など）を開く。ソースのペインでは、文字の右クリックのままにする。
// ソースのペインでは原文を書ける（SourcePane.tsx）。描いた文書は、ページの原文を読んで（base の parseMarkdown）、段落の中の改行 1 つを利用者の設定の項目のとおりに見せ（soft-break.ts）、ページの紙の幅で、枠を付けずに紙の色の面に描き、下へいくらでも伸びる。
// 原文を読み直すのは、書くのを待たせないよう、画面とは別の処理の流れで読む（base の useMarkdownDocument）。ペインが紙より狭いときだけ、紙の幅のまま縮めて収める。両方のペインを並べている間は、ソースのペインをスクロールすると、描いた文書のペインがブロックごとに付いて行く（scroll-sync.ts）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す
import { type MouseEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  type BookViewProps,
  useBook,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useMessages,
  useSetStageState,
  useShownPage,
  useStageState,
  useUiCatalog,
  useUserSetting,
} from "../../../../plugin-api/ui"
import { type MarkdownDocument, paperSize, SOFT_BREAK, softBreakOf } from "../../../base"
import {
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
  EVEN_PANE_SHARE,
  PANES,
  type PaneLayout,
  paneInputOf,
  paneLayoutOf,
  shareAt,
  shownPanes,
  splitOf,
  swapPanes,
  withChosen,
  withOpening,
} from "../panes"
import { followScroll, type PaneMarks } from "../scroll-sync"
import { shrinkTo } from "../shrink"
import styles from "./MarkdownView.module.css"
import { SourcePane } from "./SourcePane"
import { renderedRanges, scrollToRange } from "./search-ranges"
import { usePaneSwap } from "./usePaneSwap"

const TITLES = { source: "Source", rendered: "Preview" } as const

export function MarkdownView({ stage }: BookViewProps) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const page = useShownPage(stage)
  const book = useBook(stage)
  const state = useStageState(stage, kit)
  const shownPage = page ? paneInputOf(page) : null
  const layout = paneLayoutOf(state, shownPage)
  const setStageState = useSetStageState(kit)
  const setLayout = (next: PaneLayout) => setStageState(stage, withChosen(state, next))
  const swap = usePaneSwap(() => setLayout(swapPanes(layout)))
  const openMenu = useContextMenu(stage, PANE_CONTEXT)
  const panes = useRef<HTMLDivElement>(null)
  const source = useRef<HTMLDivElement>(null)
  const rendered = useRef<HTMLDivElement>(null)
  const text = page && "text" in page && typeof page.text === "string" ? page.text : ""
  const document = useMarkdownDocument(text, page?.id ?? "")
  // ページを開いたとき（替えたとき）に決めた並べ方を置き場に書く（本文を打っても決め直さない）
  const openedId = shownPage?.id
  const openedText = shownPage?.text
  // biome-ignore lint/correctness/useExhaustiveDependencies: 本文は開いたとき（ページが替わったとき）だけ読む
  useEffect(() => {
    if (openedId === undefined) return
    const next = withOpening(state, { id: openedId, text: openedText ?? "" })
    if (next) setStageState(stage, next)
  }, [openedId])
  if (!page || !book) return <NoPages stage={stage} />
  const width = paperSize(catalog, page)?.w
  // ソースのペインのスクロールに、描いた文書のペインを付いて行かせる（片方だけ見せている間は、描いた文書のペインが無い）
  const follow = () => {
    const [from, to] = [source.current, rendered.current]
    if (!from || !to) return
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
        <LayoutButtons stage={stage} />
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
                  stage={stage}
                  book={book.id}
                  page={page.id}
                  text={text}
                  document={document}
                  scrollRef={source}
                  onScroll={follow}
                />
              ) : (
                <Rendered
                  stage={stage}
                  page={page.id}
                  document={document}
                  width={width}
                  scrollRef={rendered}
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
            onMove={(at, length) => setLayout({ ...layout, share: shareAt(at, length, layout.share) })}
            onReset={() => setLayout({ ...layout, share: EVEN_PANE_SHARE })}
            className={styles.splitter}
            data-pane-splitter
          />
        )}
      </div>
      {drag && (
        <div className={styles.ghost} style={{ left: drag.x - drag.grab.x, top: drag.y - drag.grab.y }}>
          {t(TITLES[drag.pane])}
        </div>
      )}
    </div>
  )
}

// 描いた文書のペインの中身: 紙の幅で描き、ペインが紙より狭いときだけ縮めて収める。
// 幅は小数まで測って切り捨てる（clientWidth の四捨五入で 1px 未満はみ出し、横のスクロールバーが出ないように）。
// 縮めても紙の色がペインの下まで届くよう、縮める前の高さを倍率で割って伸ばす
// 検索の当たりを光らせる（今の当たりは濃く）。ソースのペインを見せていなければ、今の当たりが見えるようにスクロールする（見せていれば、ソースのペインに付いて行く）
function Rendered({
  stage,
  page,
  document,
  width,
  scrollRef: ref,
  followHit,
  onContextMenu,
}: {
  stage: string
  page: string
  document: MarkdownDocument
  width: number | undefined
  scrollRef: RefObject<HTMLDivElement | null>
  followHit: boolean
  onContextMenu: (e: MouseEvent) => void
}) {
  const search = useSearchHits(stage, page)
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
    <div ref={ref} className={`${styles.scroll} ${styles.rendered}`} onContextMenu={onContextMenu}>
      <article className={styles.document} style={width ? { width, zoom, minHeight: `${100 / zoom}%` } : undefined}>
        <MarkdownDocumentView document={document} softBreak={softBreak} />
      </article>
    </div>
  )
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
function LayoutButtons({ stage }: { stage: string }) {
  const t = useMessages(kit)
  return (
    <div className={styles.layouts} role="toolbar" aria-label={t("Panes")}>
      {PANE_LAYOUT_COMMANDS.map(c => (
        <LayoutButton key={c.id} stage={stage} id={c.id} />
      ))}
    </div>
  )
}

function LayoutButton({ stage, id }: { stage: string; id: (typeof PANE_LAYOUT_COMMANDS)[number]["id"] }) {
  const t = useMessages(kit)
  const command = useCommand(stage, id)
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

function NoPages({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const newPage = useCommand(stage, "@matomezu/base:page-new")
  return (
    <div className={styles.empty}>
      <p className={styles.prompt}>{t("No pages")}</p>
      {newPage.shown && (
        <button type="button" className={styles.create} onClick={() => newPage.run()}>
          {t("Create page")}
        </button>
      )}
    </div>
  )
}
