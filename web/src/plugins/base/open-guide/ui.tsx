// 開き方の案内（ウィジェット open-guide。カードの上の辺をツナギドリが歩く。UI マッピング UNKNOWN_BROWSER_LAYOUT で根に置く）: 常駐は立っているが、このブラウザを知らない（画面 cookie が無い・合わない）ときに、
// 画面を組む代わりに出す。AI に頼むか、ターミナルで matomezu open（Windows で npm から入れたなら matomezu.cmd open）を実行すると、常駐が cookie を渡して新しいタブで開く。この窓はそのまま止まる。
// コピーを押すと、ボタンの字を COPIED_MS の間だけ、書けたか書けなかったかに替える
import { useEffect, useState } from "react"

import { useMessages } from "../../../ui/i18n"
import { defineWidget } from "../../../ui/layout"
import { BirdWalk, birdClass } from "../birds/BirdWalk"
import { kit } from "../kit"
import { useCopyText, useMatomezuCommand, useWindowTitle } from "../window-io/hooks"
import styles from "./OpenGuide.module.css"

const COPIED_MS = 1500

type Copied = "none" | "done" | "failed"

function OpenGuide() {
  const t = useMessages(kit)
  const copyText = useCopyText()
  const command = `${useMatomezuCommand()} open`
  const [copied, setCopied] = useState<Copied>("none")
  useEffect(() => {
    if (copied === "none") return
    const timer = setTimeout(() => setCopied("none"), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () =>
    copyText(command).then(
      () => setCopied("done"),
      () => setCopied("failed"),
    )
  const title = t("How to open matomezu")
  useWindowTitle(title)
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.perch}>
          <BirdWalk bird="tsunagidori" arrival="fly" awayLabel={title}>
            {style => <span className={birdClass} style={style} aria-hidden />}
          </BirdWalk>
        </div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.how}>{t("Ask your AI to “run matomezu open”, or run it in a terminal")}</p>
        <div className={styles.terminal}>
          <div className={styles.bar}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
            <button type="button" className={styles.copy} onClick={() => void copy()}>
              {t(COPY_LABELS[copied])}
            </button>
          </div>
          <div className={styles.line}>
            <span className={styles.prompt}>$</span> {command}
            <span className={styles.cursor} />
          </div>
        </div>
      </section>
    </main>
  )
}

const COPY_LABELS = { none: "Copy", done: "Copied", failed: "Could not copy" } as const

export const OPEN_GUIDE = defineWidget({ id: kit.name("open-guide"), slots: ["root"], view: OpenGuide })
