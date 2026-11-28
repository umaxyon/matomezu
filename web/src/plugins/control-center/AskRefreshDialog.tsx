// 引継ぎページを書いて会話を空にするよう AI に頼む確認: 題の問いとその右の（？。説明は上に出し、送るを隠さない）、送る・やめる。送るのは AI へのメッセージだけで、送ったら閉じる（待ちの様子は持たない）。
// 送るは、参加者の AI のプログラムが会話を空にできると名乗っていなければ押せない。参加者がワークルームから居なくなれば、すぐ閉じる
import { useEffect } from "react"
import type { DialogProps } from "../../plugin-api/ui"
import { useActions, useMessages } from "../../plugin-api/ui"
import { NO_OCCUPANT } from "../base"
import { ActionButton, Dialog, HelpButton, useAskRefresh, useWorkroomRows } from "../base/ui"
import { kit } from "./kit"
import styles from "./WorkroomLeaveDialog.module.css"

export function AskRefreshDialog({ args, onClose }: DialogProps<{ participant: string }>) {
  const t = useMessages(kit)
  const { showToast } = useActions()
  const ask = useAskRefresh()
  const row = useWorkroomRows().find(r => r.participant !== NO_OCCUPANT && r.participant.id === args.participant)
  const gone = !row
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])
  if (gone) return null
  const title = t("Send the instruction to clear the context?")
  const failed = () => showToast({ kind: "warn", message: kit.message("Could not send the instruction") })
  return (
    <Dialog
      title={title}
      aside={<HelpButton text={t("What the instruction to clear the context sends")} label={title} side="above" />}
      width={460}
      onClose={onClose}
    >
      <div className={styles.buttons}>
        <ActionButton
          primary
          disabled={!row.refreshable}
          onClick={() => {
            onClose()
            ask(args.participant).then(ok => {
              if (!ok) failed()
            }, failed)
          }}
        >
          {t("Send")}
        </ActionButton>
        <ActionButton onClick={onClose}>{t("Don't send")}</ActionButton>
      </div>
    </Dialog>
  )
}
