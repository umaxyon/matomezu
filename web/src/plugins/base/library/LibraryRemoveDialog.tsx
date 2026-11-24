// 書庫から、ブックやバインダの中の物を消す前に確かめるダイアログ（アクション entry-remove）: 書くことはブックスクリーンのページ・バインダの削除のダイアログと同じ。
// 消した物は書庫の画面の履歴で戻せる。断られたら、トーストで知らせて開いたままにする
import { useState } from "react"
import { placeOf, titleOf } from "../../../core/entries"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useCatalog, useReadState } from "../../../ui/store-context"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { ENTRY_REMOVE } from "./entry-remove"
import { useReadNaming } from "./hooks"
import { useLibraryPerform } from "./useLibraryPerform"

export function LibraryRemoveDialog({ args, onClose }: DialogProps<{ entry: string }>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const read = useReadState()
  const naming = useReadNaming()
  const perform = useLibraryPerform()
  // 開いたときの名前と、バインダならそのページのタイプの題名（消す物が無ければ undefined）
  const [shown] = useState(() => {
    const s = read()
    const kind = placeOf(s.folders, args.entry)?.ref.kind
    if (kind !== "page" && kind !== "binder") return undefined
    const title = titleOf(s, kind, args.entry, naming()) ?? ""
    const row = s.folders[args.entry]
    const type = row?.folderRole === "binder" ? catalog.pageTypes.get(row.pageType)?.title : undefined
    return { title, type }
  })
  if (!shown) return null
  const type = shown.type === undefined ? undefined : t(shown.type)
  return (
    <Dialog
      title={type === undefined ? t("Delete page") : t("Delete {type}", { type })}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton
            danger
            onClick={() => {
              if (perform(ENTRY_REMOVE.id, { entry: args.entry }, "Could not delete")) onClose()
            }}
          >
            {t("Delete")}
          </ActionButton>
        </>
      }
    >
      <p>
        {`${shown.title}: ${
          type === undefined
            ? t("The page and its contents will be deleted")
            : t("The {type} and its pages will be deleted", { type })
        }`}
      </p>
    </Dialog>
  )
}
