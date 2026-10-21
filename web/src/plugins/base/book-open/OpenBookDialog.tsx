// ブックを開くダイアログ: 探して選んだブックを、そのステージで開く

import { useT } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions } from "../../../ui/store-context"
import { Dialog } from "../dialog-host/Dialog"
import { BookSearch } from "./BookSearch"

export function OpenBookDialog({ stage, onClose }: DialogProps) {
  const { openBook } = useActions()
  const t = useT()
  return (
    <Dialog title={t("Open book")} onClose={onClose}>
      <BookSearch
        autoFocus
        onSelect={book => {
          openBook(stage, book)
          onClose()
        }}
      />
    </Dialog>
  )
}
