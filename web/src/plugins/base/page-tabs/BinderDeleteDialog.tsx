// バインダを消す前に確かめるダイアログ: ページタブのバインダの右クリックのメニューから開く。消す（アクション binder-remove）と中のページごと消え戻せないので、押す前に知らせる。断られたら開いたままにする
import { findBinder } from "../../../core/book"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { useAllowedOn, useBook, usePerform } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { BINDER_REMOVE } from "../pages/binders"
import type { BinderSettingsArgs } from "."

export function BinderDeleteDialog({ args, onClose }: DialogProps<BinderSettingsArgs>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const book = useBook()
  const binder = book ? findBinder(book, args.binder) : undefined
  const type = binder ? catalog.pageTypes.get(binder.pageType) : undefined
  const removable = useAllowedOn(BINDER_REMOVE.id, { binder: args.binder }, book ? { book: book.id } : undefined).ok
  const perform = usePerform()
  if (!binder || !type) return null
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
              if (perform(BINDER_REMOVE.id, { binder: binder.id }).ok) onClose()
            }}
          >
            {t("Delete")}
          </ActionButton>
        </>
      }
    >
      <p>{`${binder.title}: ${t("The {type} and its pages will be deleted", { type: t(type.title) })}`}</p>
    </Dialog>
  )
}
