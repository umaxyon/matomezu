// コントロールセンターの郵便箱の画面: 題の帯と最大化ボタンの下に、郵便箱（base の MailboxView）を描く。背景はプロジェクトの領域と同じ奥の面。
// 置き場（className）と、ワークルームの枠が退いて下まで広がるか（retreat）は、画面の側が決める
import { useMessages } from "../../plugin-api/ui"
import { MailboxView, Panel, TitledArea } from "../base/ui"
import { kit } from "./kit"
import styles from "./MailboxArea.module.css"

export function MailboxArea({
  className,
  retreat,
  maximized,
  onToggleMaximize,
}: {
  className: string | undefined
  retreat: boolean
  maximized: boolean
  onToggleMaximize: () => void
}) {
  const t = useMessages(kit)
  return (
    <Panel recess className={className} data-max={retreat}>
      <TitledArea
        className={styles.area}
        title={t("Mailbox")}
        maximized={maximized}
        onToggleMaximize={onToggleMaximize}
      >
        <MailboxView className={styles.mailbox} />
      </TitledArea>
    </Panel>
  )
}
