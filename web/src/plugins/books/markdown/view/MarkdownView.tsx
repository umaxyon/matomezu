// マークダウンのビュー（見せ方 markdown）: ブックのビューのレイヤー（book-content）が描く。ステージに紙は無く、ステージいっぱいにペインを並べ、ペインの中をふつうにスクロールする。
// 並べ方はステージごとの画面の状態（panes.ts）: 左右か上下に 2 つ並べるか、1 つだけ見せて上辺のペインのタブ（ソース・プレビュー）で切り替える。並べている間は、ペインごとに上辺にそのペインのタブを出す。
// ペインのタブの右クリックで、ペインの分割のメニュー（pane-context。右クリックしたペインを受け取る）を開く。
// 描いた文書は、ページの紙の幅で、枠を付けずに紙の色の面に描き、下へいくらでも伸びる。ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す
import type { MouseEvent } from "react"
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
import { paperSize } from "../../../base"
import { kit } from "../kit"
import { PANE_CONTEXT } from "../markdown"
import { PANES, type Pane, paneLayoutOf } from "../panes"
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
            <div className={styles.scroll}>
              {pane === "source" ? (
                <pre className={styles.source}>{text}</pre>
              ) : (
                <article className={styles.document} style={width ? { width } : undefined}>
                  <pre className={styles.plain}>{text}</pre>
                </article>
              )}
            </div>
          </section>
        ))}
      </div>
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
