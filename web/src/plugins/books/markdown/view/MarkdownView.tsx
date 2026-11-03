// マークダウンのビュー（見せ方 markdown）: ブックのビューのレイヤー（book-content）が描く。ステージに紙は無く、ステージいっぱいにペインを並べ、ペインの中をふつうにスクロールする。
// 並べ方はステージごとの画面の状態（panes.ts）: 左右か上下に 2 つ並べるか、1 つだけ見せて上辺のペインのタブ（ソース・プレビュー）で切り替える。並べている間は、ペインごとに上辺にそのペインのタブを出す。
// ペインのタブの右クリックで、ペインの分割のメニュー（pane-context。右クリックしたペインを受け取る）を開く。
// ソースのペインでは原文を書ける（SourcePane.tsx）。描いた文書は、ページの原文を読んで（base の parseMarkdown）、ページの紙の幅で、枠を付けずに紙の色の面に描き、下へいくらでも伸びる。
// 原文を読み直して描くのは、書くのを待たせないよう後回しにする（React の遅らせた値）。ペインが紙より狭いときだけ、紙の幅のまま縮めて収める。両方のペインを並べている間は、ソースのペインをスクロールすると、描いた文書のペインがブロックごとに付いて行く（scroll-sync.ts）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す
import { type MouseEvent, type RefObject, useDeferredValue, useMemo, useRef, useState } from "react"
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
} from "../../../../plugin-api/ui"
import { type MarkdownDocument, paperSize, parseMarkdown } from "../../../base"
import { useResize } from "../../../base/ui"
import { kit } from "../kit"
import { PANE_CONTEXT } from "../markdown"
import { PANES, type Pane, paneLayoutOf } from "../panes"
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
  const setPanes = useSetStageState(kit)
  const openMenu = useContextMenu(stage, PANE_CONTEXT)
  const source = useRef<HTMLDivElement>(null)
  const rendered = useRef<HTMLDivElement>(null)
  const text = page && "text" in page && typeof page.text === "string" ? page.text : ""
  const read = useDeferredValue(text)
  const document = useMemo(() => parseMarkdown(read), [read])
  if (!page || !book) return <NoPages stage={stage} />
  const width = paperSize(catalog, page)?.w
  // ソースのペインのスクロールに、描いた文書のペインを付いて行かせる（片方だけ見せている間は、描いた文書のペインが無い）
  const follow = () => {
    const [from, to] = [source.current, rendered.current]
    if (from && to) to.scrollTop = followScroll(marksOf(from), marksOf(to), from.scrollTop)
  }
  const shown = layout.split === null ? [layout.shown] : PANES
  const tab = (pane: Pane, onClick?: () => void) => (
    <button
      key={pane}
      type="button"
      role="tab"
      className={styles.tab}
      aria-selected={shown.includes(pane)}
      onClick={onClick}
      onContextMenu={(e: MouseEvent) => openMenu(e, { pane })}
    >
      {t(TITLES[pane])}
    </button>
  )
  return (
    <div className={styles.markdown} data-split={layout.split ?? "none"}>
      {layout.split === null && (
        <div className={styles.tabs} role="tablist" aria-label={t("Panes")}>
          {PANES.map(p => tab(p, () => setPanes(stage, { split: null, shown: p })))}
        </div>
      )}
      <div className={styles.panes}>
        {shown.map(pane => (
          <section key={pane} className={styles.pane} data-pane={pane} aria-label={t(TITLES[pane])}>
            {layout.split !== null && (
              <div className={styles.tabs} role="tablist" aria-label={t("Panes")}>
                {tab(pane)}
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
              <Rendered document={document} width={width} scrollRef={rendered} />
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
}: {
  document: MarkdownDocument
  width: number | undefined
  scrollRef: RefObject<HTMLDivElement | null>
}) {
  const [room, setRoom] = useState(0)
  useResize(ref, () => {
    const el = ref.current
    if (el) setRoom(Math.floor(el.getBoundingClientRect().width - (el.offsetWidth - el.clientWidth)))
  })
  const zoom = width === undefined ? 1 : shrinkTo(room, width)
  return (
    <div ref={ref} className={`${styles.scroll} ${styles.rendered}`}>
      <article className={styles.document} style={width ? { width, zoom, minHeight: `${100 / zoom}%` } : undefined}>
        <MarkdownDocumentView document={document} />
      </article>
    </div>
  )
}

// スクロールするペイン el の、ブロックの目印（data-markdown-block）ごとの上端と、いちばん下までのスクロールの量（縮めた倍率も含めて、見えている位置で測る）
function marksOf(el: HTMLElement): PaneMarks {
  const top = el.getBoundingClientRect().top - el.scrollTop
  const blocks = new Map<number, number>()
  for (const mark of el.querySelectorAll("[data-markdown-block]"))
    blocks.set(Number(mark.getAttribute("data-markdown-block")), mark.getBoundingClientRect().top - top)
  return { blocks, end: el.scrollHeight - el.clientHeight }
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
