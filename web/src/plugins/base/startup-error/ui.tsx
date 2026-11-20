// 起動エラーの画面（ウィジェット startup-error。UI マッピング STARTUP_ERROR_LAYOUT で根に置く）: 画面が起動を止めたとき、ブックを開かずに、
// 見出しと止めた理由の種類ごとの説明・原因の一覧（名前と理由の文。全部折り返して出し、長ければ一覧の枠の中だけを送る）・直すボタン・種類ごとの補足だけを出す。
// ボタンを押している間と、直せた（画面の入口が窓を読み直す）あとは押せない。直せなければ、ボタンの下に失敗の 2 行（種類ごとの 1 行目と、断られた理由か常駐につながらない）を出し、
// 断られたら一覧を残りの原因に替えて、また押せる
import { useState } from "react"

import type { StartupCause, StartupErrorKind, StartupFixOutcome } from "../../../store/store"
import { useMessages } from "../../../ui/i18n"
import { defineWidget } from "../../../ui/layout"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useWindowTitle } from "../window-io/hooks"
import { useStartupError } from "./hooks"
import type { STARTUP_ERROR_MESSAGES } from "./messages"
import styles from "./StartupError.module.css"

const ID = kit.name("startup-error")

// 止めた理由の種類ごとの文言のキー（STARTUP_ERROR_MESSAGES）
type Key = keyof typeof STARTUP_ERROR_MESSAGES
interface Texts {
  lead: Key
  fix: Key
  failed: Key
  note: Key
}
const TEXTS: Record<StartupErrorKind, Texts> = {
  "plugins-not-added": {
    lead: "Some added plugins could not be added",
    fix: "Remove and open",
    failed: "Could not remove",
    note: "Pages of removed plugins move to the unreadable folder, and come back when the plugins are added again",
  },
}

type Pressed = { state: "idle" } | { state: "pressing" } | Exclude<StartupFixOutcome, { state: "refused" }> | Refused
type Refused = { state: "refused"; reason: string }

function StartupErrorView() {
  const t = useMessages(kit)
  const error = useStartupError(ID)
  const texts = TEXTS[error.kind]
  const [causes, setCauses] = useState<readonly StartupCause[]>(error.causes)
  const [pressed, setPressed] = useState<Pressed>({ state: "idle" })
  const title = t("Cannot open matomezu")
  useWindowTitle(title)
  const press = async () => {
    setPressed({ state: "pressing" })
    const outcome = await error.fix(causes)
    if (outcome.state === "refused") {
      setCauses(outcome.causes)
      setPressed({ state: "refused", reason: outcome.reason })
    } else setPressed(outcome)
  }
  const busy = pressed.state === "pressing" || pressed.state === "fixed"
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{t(texts.lead)}</p>
        <ul className={styles.causes}>
          {causes.map(c => (
            <li key={c.name} className={styles.cause}>
              <span className={styles.name}>{c.name}</span>
              <span className={styles.reason}>{c.reason}</span>
            </li>
          ))}
        </ul>
        <div className={styles.fix}>
          <ActionButton primary disabled={busy} onClick={() => void press()}>
            {t(texts.fix)}
          </ActionButton>
        </div>
        {(pressed.state === "refused" || pressed.state === "unreachable") && (
          <div className={styles.failed} role="alert">
            <span>{t(texts.failed)}</span>
            <span className={styles.reason}>
              {pressed.state === "refused" ? pressed.reason : t("Cannot reach the matomezu server")}
            </span>
          </div>
        )}
        <p className={styles.note}>{t(texts.note)}</p>
      </section>
    </main>
  )
}

export const STARTUP_ERROR = defineWidget({ id: ID, slots: ["root"], view: StartupErrorView })
