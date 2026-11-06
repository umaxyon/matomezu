// 郵便箱（ウィジェット mailbox。左サイドパネルの最初のタブ）: 届いた郵便を新しい順に並べる。行には、まだ見ていない印・送り手・題・届いた時刻を出す。
// 行を押すと郵便のダイアログを開く（本文はダイアログで見せ、そこで見たことになる）。「取消」は確かめてから、その郵便を消す
import { useState } from "react"
import type { Mail } from "../../../core/mail"
import { useMessages } from "../../../ui/i18n"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import styles from "../outbox/Outbox.module.css"
import { shownTime } from "../outbox/rows"
import { clampChars } from "../text/text"
import type { StageSlotProps } from "../workspace/ui"
import { MAIL_REMOVE } from "."
import { useMailAction, useMailbox, useOpenMail } from "./hooks"
import own from "./Mail.module.css"
import { shownOf } from "./shown"

const TITLE_CHARS = 24 // 行に出す題の字数

export function MailboxView({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const mailbox = useMailbox()
  if (mailbox.length === 0) return <p className={styles.empty}>{t("No mail")}</p>
  const now = new Date()
  return (
    <ul className={`${styles.rows} ${styles.list}`}>
      {[...mailbox].reverse().map(m => (
        <Row key={m.id} stage={stage} mail={m} now={now} />
      ))}
    </ul>
  )
}

function Row({ stage, mail: m, now }: { stage: string; mail: Mail; now: Date }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const open = useOpenMail()
  const act = useMailAction()
  const [asking, setAsking] = useState(false)
  const title = clampChars(shownOf(catalog, m)?.title ?? t("Mail"), TITLE_CHARS)
  return (
    <li className={styles.row} data-read={!!m.seenAt}>
      <button type="button" className={styles.open} onClick={() => open(stage, m.id)}>
        <span className={own.unread} data-unread={!m.seenAt} />
        <span className={styles.text}>
          <span className={own.from}>{m.from}</span>
          {title}
        </span>
        <time className={styles.time}>{shownTime(m.sentAt, now)}</time>
      </button>
      {asking ? (
        // biome-ignore lint/a11y/useSemanticElements: 確かめの 2 つのボタンを束ねる箱で、入力Formのまとまり（fieldset）ではない
        <span className={styles.ask} role="group" aria-label={t("Withdraw?")}>
          <button
            type="button"
            className={styles.yes}
            onClick={() => {
              setAsking(false)
              act(MAIL_REMOVE.id, m.id)
            }}
          >
            {t("Withdraw")}
          </button>
          <button type="button" className={styles.withdraw} onClick={() => setAsking(false)}>
            {t("Keep")}
          </button>
        </span>
      ) : (
        <button
          type="button"
          className={styles.withdraw}
          aria-label={t("Withdraw {name}", { name: title })}
          onClick={() => setAsking(true)}
        >
          {t("Withdraw")}
        </button>
      )}
    </li>
  )
}
