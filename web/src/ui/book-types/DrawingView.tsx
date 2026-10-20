// 図面のブックのビュー: ステージの紙の置き場所（core/stage.ts の placement）に紙を描く。
// ページが無ければ、真ん中にページを作るボタン（コマンド page.new）を出す。表に無い紙は代わりの紙に「不明な紙」と示し、描けない紙は知らせだけを出す
import type { Stage } from "../../core/stage"
import { placement } from "../../core/stage"
import { useCommand } from "../commands"
import { useT } from "../i18n"
import styles from "./DrawingView.module.css"

export function DrawingView({ stage }: { stage: Stage }) {
  const t = useT()
  const p = placement(stage)
  const paper = stage.opened?.paper
  if (stage.opened?.page === null) return <NoPages stage={stage} />
  if (paper?.status === "unshowable") return <p className={styles.error}>{t("この紙は表示できません")}</p>
  if (!p) return null
  return (
    <div
      className={styles.paper}
      role="img"
      aria-label={t("紙")}
      style={{ width: p.w, height: p.h, transform: `translate(${p.x}px, ${p.y}px) scale(${p.zoom})` }}
    >
      {paper?.status === "unknown" && <span className={styles.unknown}>{t("不明な紙")}</span>}
    </div>
  )
}

function NoPages({ stage }: { stage: Stage }) {
  const t = useT()
  const newPage = useCommand(stage.id, "page.new")
  return (
    <div className={styles.empty}>
      <p className={styles.prompt}>{t("ページがありません")}</p>
      {newPage.shown && (
        <button type="button" className={styles.create} onClick={() => newPage.run()}>
          {t("ページを作る")}
        </button>
      )}
    </div>
  )
}
