// マークダウンのビュー（見せ方 markdown）: ブックのビューのレイヤー（book-content）が描く。ステージに紙は無く、ステージいっぱいにペインを並べ、ペインの中をふつうにスクロールする。
// 並べ方はステージごとの画面の状態（panes.ts）: 左右か上下に 2 つ並べるか、1 つだけ見せる。いつも出る上の行の右端に、並べ方の 4 つのボタン（ソースだけ・左右・上下・
// プレビューだけ。コマンド）を並べ、並べている間は、ペインごとに上辺にペインの名前の見出しを出す。
// 上の行・見出し・プレビューのペインの右クリックで、メニュー（pane-context。ページの設定・ブックの設定など）を開く。ソースのペインでは、文字の右クリックのままにする。
// ソースのペインでは原文を書ける（SourcePane.tsx）。描いた文書は、ページの原文を読んで（base の parseMarkdown）、ページの紙の幅で、枠を付けずに紙の色の面に描き、下へいくらでも伸びる。
// 原文を読み直すのは、書くのを待たせないよう、画面とは別の処理の流れで読む（base の useMarkdownDocument）。ペインが紙より狭いときだけ、紙の幅のまま縮めて収める。両方のペインを並べている間は、ソースのペインをスクロールすると、描いた文書のペインがブロックごとに付いて行く（scroll-sync.ts）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す
import { type MouseEvent, type RefObject, useRef, useState } from "react"
import {
  type BookViewProps,
  useBook,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useMessages,
  useShownPage,
  useStageState,
  useUiCatalog,
} from "../../../../plugin-api/ui"
import { type MarkdownDocument, paperSize } from "../../../base"
import { useMarkdownDocument, useResize } from "../../../base/ui"
import { PANE_LAYOUT_COMMANDS } from "../commands"
import { kit } from "../kit"
import { PANE_CONTEXT } from "../markdown"
import { PANES, paneLayoutOf } from "../panes"
import { followScroll, type PaneMarks } from "../scroll-sync"
import { shrinkTo } from "../shrink"
import { MarkdownDocumentView } from "./MarkdownDocumentView"
import styles from "./MarkdownView.module.css"
import { SourcePane } from "./SourcePane"

const TITLES = { source: "Source", rendered: "Preview" } as const

export function MarkdownView({ stage }: BookViewProps) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const page = useShownPage(stage)
  const book = useBook(stage)
  const layout = paneLayoutOf(useStageState(stage, kit))
  const openMenu = useContextMenu(stage, PANE_CONTEXT)
  const source = useRef<HTMLDivElement>(null)
  const rendered = useRef<HTMLDivElement>(null)
  const text = page && "text" in page && typeof page.text === "string" ? page.text : ""
  const document = useMarkdownDocument(text, page?.id ?? "")
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
  const shown = layout.split === null ? [layout.shown] : PANES
  const menu = (e: MouseEvent) => openMenu(e, {})
  return (
    <div className={styles.markdown} data-split={layout.split ?? "none"}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける */}
      <div className={styles.bar} onContextMenu={menu}>
        <LayoutButtons stage={stage} />
      </div>
      <div className={styles.panes}>
        {shown.map(pane => (
          <section key={pane} className={styles.pane} data-pane={pane} aria-label={t(TITLES[pane])}>
            {layout.split !== null && (
              // biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける
              <div className={styles.heading} onContextMenu={menu}>
                {t(TITLES[pane])}
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
              <Rendered document={document} width={width} scrollRef={rendered} onContextMenu={menu} />
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

// 描いた文書のペインの中身: 紙の幅で描き、ペインが紙より狭いときだけ縮めて収める。
// 幅は小数まで測って切り捨てる（clientWidth の四捨五入で 1px 未満はみ出し、横のスクロールバーが出ないように）。
// 縮めても紙の色がペインの下まで届くよう、縮める前の高さを倍率で割って伸ばす
function Rendered({
  document,
  width,
  scrollRef: ref,
  onContextMenu,
}: {
  document: MarkdownDocument
  width: number | undefined
  scrollRef: RefObject<HTMLDivElement | null>
  onContextMenu: (e: MouseEvent) => void
}) {
  const [room, setRoom] = useState(0)
  useResize(ref, () => {
    const el = ref.current
    if (el) setRoom(Math.floor(el.getBoundingClientRect().width - (el.offsetWidth - el.clientWidth)))
  })
  const zoom = width === undefined ? 1 : shrinkTo(room, width)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける
    <div ref={ref} className={`${styles.scroll} ${styles.rendered}`} onContextMenu={onContextMenu}>
      <article className={styles.document} style={width ? { width, zoom, minHeight: `${100 / zoom}%` } : undefined}>
        <MarkdownDocumentView document={document} />
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
