// 書庫の画面からブックを作るダイアログ: 名前を決めて、開いているフォルダに作り（アクション book-create）、窓に出す
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions } from "../../../ui/view-hooks"
import { BOOK_CREATE } from "../book-new/book-create"
import { NewBookForm } from "../book-new/NewBookDialog"
import { Dialog } from "../dialog-host/Dialog"
import { kit } from "../kit"

export function LibraryNewBookDialog({ args, onClose }: DialogProps<{ into: string }>) {
  const t = useMessages(kit)
  const { perform, showBook } = useActions()
  return (
    <Dialog title={t("New book")} onClose={onClose}>
      <NewBookForm
        onDone={onClose}
        create={({ title }) => {
          const done = perform(BOOK_CREATE.id, { title, into: args.into })
          if (done.ok) showBook(done.result.book)
          return done
        }}
      />
    </Dialog>
  )
}
