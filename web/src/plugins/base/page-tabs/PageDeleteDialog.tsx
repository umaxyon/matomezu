// ページを消す前に確かめるダイアログ: ページ一覧の右クリックのメニューから開く。消す（アクション page-remove）と中身ごと消え戻せないので、押す前に知らせる。断られたら開いたままにする
import { pagedOf } from "../../../core/book"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useAllowed, useBook, usePerform } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { PAGE_REMOVE } from "./page-remove"

export function PageDeleteDialog({ stage, args, onClose }: DialogProps<{ page: string }>) {
  const t = useMessages(kit)
  const book = pagedOf(useBook(stage))
  const page = book?.pages.find(p => p.id === args.page)
  const removable = useAllowed(stage, PAGE_REMOVE.id, { page: args.page }).ok
  const perform = usePerform(stage)
  if (!page) return null
  return (
    <Dialog
      title={t("Delete page")}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton
            danger
            disabled={!removable}
            onClick={() => {
              if (perform(PAGE_REMOVE.id, { page: page.id }).ok) onClose()
            }}
          >
            {t("Delete")}
          </ActionButton>
        </>
      }
    >
      <p>{`${page.title}: ${t("The page and its contents will be deleted")}`}</p>
    </Dialog>
  )
}
