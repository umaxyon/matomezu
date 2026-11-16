// フォルダを消す前に確かめるダイアログ: ページタブのフォルダの右クリックのメニューから開く。消す（アクション folder-remove）と中のページごと消え戻せないので、押す前に知らせる。断られたら開いたままにする
import { findFolder } from "../../../core/book"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { useAllowedOn, useBook, usePerform } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import type { FolderSettingsArgs } from "."
import { FOLDER_REMOVE } from "./folders"

export function FolderDeleteDialog({ args, onClose }: DialogProps<FolderSettingsArgs>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const book = useBook()
  const folder = book ? findFolder(book, args.folder) : undefined
  const type = folder ? catalog.pageTypes.get(folder.pageType) : undefined
  const removable = useAllowedOn(FOLDER_REMOVE.id, { folder: args.folder }, book ? { book: book.id } : undefined).ok
  const perform = usePerform()
  if (!folder || !type) return null
  return (
    <Dialog
      title={t("Delete {type}", { type: t(type.title) })}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton
            danger
            disabled={!removable}
            onClick={() => {
              if (perform(FOLDER_REMOVE.id, { folder: folder.id }).ok) onClose()
            }}
          >
            {t("Delete")}
          </ActionButton>
        </>
      }
    >
      <p>{`${folder.title}: ${t("The {type} and its pages will be deleted", { type: t(type.title) })}`}</p>
    </Dialog>
  )
}
