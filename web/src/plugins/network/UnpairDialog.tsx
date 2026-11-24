// ペアリングを解く確認: 解くホスト（名前と利用者名）と、キャンセル・解く。解くと相手にも知らせる。ホストが居なくなっていれば、すぐ閉じる
import { type DialogProps, useActions, useMessages } from "../../plugin-api/ui"
import { HostConfirm } from "./HostConfirm"
import { kit } from "./kit"
import { PAIRED_HOST_REMOVE } from "./pairing"

export function UnpairDialog({ args, onClose }: DialogProps<{ pairedHost: string }>) {
  const t = useMessages(kit)
  const { perform } = useActions()
  return (
    <HostConfirm
      pairedHost={args.pairedHost}
      title={t("Unpair")}
      text={() => t("Unpairing tells the other host too")}
      confirm={t("Unpair button")}
      onConfirm={() => perform(PAIRED_HOST_REMOVE.id, {}, { record: args.pairedHost }).ok}
      onClose={onClose}
    />
  )
}
