// ほかのホストからの AI 間メッセージを、利用者の頼みとして受けるようにする確かめ: ホスト（名前と利用者名）と、何が変わるかの一言、
// キャンセル・ユーザーの指示として扱う。ホストが居なくなっていれば、すぐ閉じる
import { type DialogProps, useActions, useMessages } from "../../plugin-api/ui"
import { HostConfirm } from "./HostConfirm"
import { kit } from "./kit"
import { PAIRED_HOST_REQUESTS_SET } from "./pairing"

export function AsUserDialog({ args, onClose }: DialogProps<{ pairedHost: string }>) {
  const t = useMessages(kit)
  const { perform } = useActions()
  return (
    <HostConfirm
      pairedHost={args.pairedHost}
      title={t("Treat as the user's instructions")}
      text={name => t("Your AIs do what the AIs of {name} ask, without asking you", { name })}
      confirm={t("Treat as the user's button")}
      onConfirm={() => perform(PAIRED_HOST_REQUESTS_SET.id, { requests: "as-user" }, { record: args.pairedHost }).ok}
      onClose={onClose}
    />
  )
}
