// ブックを開くダイアログ: 探して選んだブックを、そのステージで開く
import { Dialog } from "../dialog/Dialog"
import { useT } from "../i18n"
import type { DialogProps } from "../plugin"
import { useActions } from "../store-context"
import { BookSearch } from "./BookSearch"

export function OpenBookDialog({ stage, onClose }: DialogProps) {
  const { openBook } = useActions()
  const t = useT()
  return (
    <Dialog title={t("ブックを開く")} onClose={onClose}>
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
