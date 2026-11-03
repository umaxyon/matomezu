// マークダウンのビュー（見せ方 markdown）: ブックのビューのレイヤー（book-content）が描く。ステージに紙は無く、ステージいっぱいにペインを並べ、ペインの中をふつうにスクロールする。
// 並べ方はステージごとの画面の状態（panes.ts）: 左右か上下に 2 つ並べるか、1 つだけ見せて上辺のペインのタブ（ソース・プレビュー）で切り替える。並べている間は、ペインごとに上辺にそのペインのタブを出す。
// ペインのタブの右クリックで、ペインの分割のメニュー（pane-context。右クリックしたペインを受け取る）を開く。
// 描いた文書は、ページの原文を読んで（base の parseMarkdown）、ページの紙の幅で、枠を付けずに紙の色の面に描き、下へいくらでも伸びる。
// ペインが紙より狭いときだけ、紙の幅のまま縮めて収める。ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す
import { type MouseEvent, useMemo, useRef, useState } from "react"
import {
  type BookViewProps,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useMessages,
  useSetStageState,
  useShownPage,
  useStageState,
} from "../../../../plugin-api/ui"
import { paperSize, parseMarkdown } from "../../../base"
import { useResize } from "../../../base/ui"
import { kit } from "../kit"
import { PANE_CONTEXT } from "../markdown"
import { PANES, type Pane, paneLayoutOf } from "../panes"
import { shrinkTo } from "../shrink"
import { MarkdownDocumentView } from "./MarkdownDocumentView"
import styles from "./MarkdownView.module.css"

const TITLES = { source: "Source", rendered: "Preview" } as const

export function MarkdownView({ stage }: BookViewProps) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const page = useShownPage(stage)
  const layout = paneLayoutOf(useStageState(stage, kit))
  const setPanes = useSetStageState(kit)
  const openMenu = useContextMenu(stage, PANE_CONTEXT)
  if (!page) return <NoPages stage={stage} />
  const text = "text" in page && typeof page.text === "string" ? page.text : ""
  const width = paperSize(catalog, page)?.w
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
              <div className={styles.scroll}>
                <pre className={styles.source}>{text}</pre>
              </div>
            ) : (
              <Rendered text={text} width={width} />
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
function Rendered({ text, width }: { text: string; width: number | undefined }) {
  const ref = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(0)
  useResize(ref, () => {
    const el = ref.current
    if (el) setRoom(Math.floor(el.getBoundingClientRect().width - (el.offsetWidth - el.clientWidth)))
  })
  const document = useMemo(() => parseMarkdown(text), [text])
  const zoom = width === undefined ? 1 : shrinkTo(room, width)
  return (
    <div ref={ref} className={`${styles.scroll} ${styles.rendered}`}>
      <article className={styles.document} style={width ? { width, zoom, minHeight: `${100 / zoom}%` } : undefined}>
        <MarkdownDocumentView document={document} />
      </article>
    </div>
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
