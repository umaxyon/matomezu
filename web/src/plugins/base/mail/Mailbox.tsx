// 郵便箱（ウィジェット mailbox。左サイドパネルのタブ）: 届いた郵便を新しい順に並べる。行には、まだ見ていない印・送り手・題・届いた時刻を出す。
// 種類が印を添えれば（反映済みなど）、題のあとに出す。行を押すと郵便のダイアログを開く（本文はダイアログで見せ、そこで見たことになる）。「取消」は確かめてから、その郵便を消す（消せなければ押せず、断られたらトースト）

import { useMessages } from "../../../ui/i18n"
import { useActions, useAllowedOn, useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { clampChars } from "../text/text"
import styles from "../utils/PanelRows.module.css"
import { refusalMessage } from "../utils/refusal"
import { shownTime } from "../utils/shown-time"
import { Withdraw } from "../utils/Withdraw"
import { MAIL_REMOVE } from "."
import { useMailbox, useOpenMail } from "./hooks"
import own from "./Mail.module.css"
import type { Mail } from "./mail"
import { shownOf } from "./shown"

const TITLE_CHARS = 24 // 行に出す題の字数

export function MailboxView() {
  const t = useMessages(kit)
  const mailbox = useMailbox()
  if (mailbox.length === 0) return <p className={styles.empty}>{t("No mail")}</p>
  const now = new Date()
  return (
    <ul className={`${styles.rows} ${styles.list}`}>
      {[...mailbox].reverse().map(m => (
        <Row key={m.id} mail={m} now={now} />
      ))}
    </ul>
  )
}

function Row({ mail: m, now }: { mail: Mail; now: Date }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const open = useOpenMail()
  const { perform, showToast } = useActions()
  // 郵便のレコードが対象のアクションなので、ステージのブックに付けずに行う。断られたらトーストに出す
  const remove = () => {
    const done = perform(MAIL_REMOVE.id, {}, { record: m.id })
    if (!done.ok) showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Could not withdraw")) })
  }
  // 消せなければ（認可ステップが止めたなど）、取消を押せなくする
  const removable = useAllowedOn(MAIL_REMOVE.id, {}, { record: m.id }).ok
  const shown = shownOf(catalog, m, t)
  const title = clampChars(shown?.title ?? t("Mail"), TITLE_CHARS)
  return (
    <li className={styles.row} data-read={!!m.seenAt}>
      <button type="button" className={styles.open} onClick={() => open(m.id)}>
        <span className={own.unread} data-unread={!m.seenAt} />
        <span className={styles.text}>
          <span className={own.from}>{m.from}</span>
          {title}
          {shown?.mark && <span className={own.mark}>{shown.mark}</span>}
        </span>
        <time className={styles.time}>{shownTime(m.sentAt, now)}</time>
      </button>
      <Withdraw name={title} allowed={removable} onWithdraw={remove} />
    </li>
  )
}
