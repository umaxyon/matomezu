// 開き方の案内（ウィジェット unknown-browser。案内の UI マッピングで根に置く）: 常駐は立っているが、このブラウザを知らない（画面 cookie が無い・合わない）ときに、
// 画面を組む代わりに出す。AI に頼むか、ターミナルで matomezu open を実行すると、常駐が cookie を渡して新しいタブで開く。この窓はそのまま止まる

import { useMessages } from "../../../ui/i18n"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { BirdFaceView } from "../participant/BirdFaceView"
import { useCopyText, useWindowTitle } from "../window-io/hooks"
import styles from "./UnknownBrowser.module.css"

const COMMAND = "matomezu open"
const FACE_SIZE = 72

function UnknownBrowser() {
  const t = useMessages(kit)
  const copy = useCopyText()
  const title = t("How to open matomezu")
  useWindowTitle(title)
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <BirdFaceView bird="inko" size={FACE_SIZE} />
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.how}>{t("Ask your AI to “run matomezu open”, or run it in a terminal")}</p>
        <div className={styles.terminal}>
          <div className={styles.bar}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
            <button type="button" className={styles.copy} onClick={() => void copy(COMMAND).catch(() => {})}>
              {t("Copy")}
            </button>
          </div>
          <div className={styles.line}>
            <span className={styles.prompt}>$</span> {COMMAND}
            <span className={styles.cursor} />
          </div>
        </div>
      </section>
    </main>
  )
}

export const UNKNOWN_BROWSER = defineWidget({ id: kit.name("unknown-browser"), slots: ["root"], view: UnknownBrowser })
