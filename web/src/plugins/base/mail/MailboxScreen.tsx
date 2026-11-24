// 郵便箱のスクリーン（screen.ts の MAILBOX_SCREEN）を描く: 帯と、郵便箱の画面（MailboxView）。
// ブックスクリーンと上下に並べている間は、帯に「→ 閉じる」と「広げる」（書庫のスクリーンと同じ形）。窓いっぱいのときは、帯に名前と閉じるボタン。閉じる・広げるは screen.ts のコマンドを通る。
// 書庫のスクリーンと違い、外を押しても閉じない（上のステージで行き先を見ながら、続けて郵便を選ぶため）
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { CLOSE, CLOSE_RIGHT, EXPAND } from "../library/icons"
import { IconButton } from "../utils/IconButton"
import { BOOK_SCREEN_DEF } from "../window"
import { useScreenSplit } from "../window/useScreenSplit"
import styles from "./MailboxScreen.module.css"
import { MailboxView } from "./MailboxView"
import { MAILBOX_SCREEN_CLOSE, MAILBOX_SCREEN_EXPAND } from "./screen"

export function MailboxScreen() {
  const t = useMessages(kit)
  const split = useScreenSplit()
  const below = split.inSplit && split.defs.includes(BOOK_SCREEN_DEF.id)
  // 窓が低くて、下に出す代わりに窓いっぱいに出している間は、広げる物が無い
  const low = !split.tall
  const closing = useCommand(MAILBOX_SCREEN_CLOSE.id)
  const expanding = useCommand(MAILBOX_SCREEN_EXPAND.id)
  const close = () => closing.run()
  return (
    <div className={styles.screen}>
      <div className={styles.band}>
        {below ? (
          <>
            <button type="button" className={styles.close} onClick={close}>
              {CLOSE_RIGHT}
              {t("Close mailbox")}
            </button>
            {low ? null : (
              <>
                <span className={styles.divider} aria-hidden="true" />
                <IconButton label={t("Expand mailbox")} onClick={() => expanding.run()}>
                  {EXPAND}
                </IconButton>
              </>
            )}
          </>
        ) : (
          <>
            <h2 className={styles.title}>{t("Mailbox")}</h2>
            <IconButton label={t("Close mailbox")} onClick={close}>
              {CLOSE}
            </IconButton>
          </>
        )}
      </div>
      <MailboxView className={styles.pane} />
    </div>
  )
}
