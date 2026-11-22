// ブックの外のページ・バインダを、ブックかバインダの中へ入れると印刷の設定が既定に戻るときの確かめ（入れるか・やめるか）
import { titleOf } from "../../../core/entries"
import { useMessages } from "../../../ui/i18n"
import { useReadState } from "../../../ui/store-context"
import { Confirm } from "../dialog-host/Confirm"
import { kit } from "../kit"
import { useNameOf, useReadNaming } from "./hooks"
import { NO_TITLE } from "./outline"
import type { ClearingMove } from "./useLibraryDrag"

export function SettingsClearConfirm({ clearing, onDone }: { clearing: ClearingMove; onDone(go: boolean): void }) {
  const t = useMessages(kit)
  const read = useReadState()
  const nameOf = useNameOf()
  const naming = useReadNaming()
  const { to } = clearing
  const folder = nameOf({ id: to.into, title: titleOf(read(), "folder", to.into, naming()) ?? NO_TITLE })
  return (
    <Confirm
      message={t('It will go to "{folder}"', { folder })}
      detail={[t("Its print settings go back to the defaults")]}
      ok={t("OK")}
      cancel={t("Cancel")}
      onOk={() => onDone(true)}
      onCancel={() => onDone(false)}
    />
  )
}
