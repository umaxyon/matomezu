// コントロールセンターの郵便箱の画面: 題の帯と最大化ボタンの下に、郵便箱（base の MailboxPane）を描く。背景はプロジェクトの領域と同じ奥の面
import { useMessages } from "../../plugin-api/ui"
import { MailboxPane, Panel, TitledArea } from "../base/ui"
import { kit } from "./kit"
import styles from "./MailboxArea.module.css"

export function MailboxArea({ maximized, onToggleMaximize }: { maximized: boolean; onToggleMaximize: () => void }) {
  const t = useMessages(kit)
  return (
    <Panel recess>
      <TitledArea
        className={styles.area}
        title={t("Mailbox")}
        maximized={maximized}
        onToggleMaximize={onToggleMaximize}
      >
        <MailboxPane className={styles.mailbox} />
      </TitledArea>
    </Panel>
  )
}
