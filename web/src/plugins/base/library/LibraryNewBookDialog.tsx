// 書庫の画面からブックを作るダイアログ: 名前を決めて、開いているフォルダに作り（アクション book-create）、書庫の行を開くのと同じ道（library-entry-open）で窓に出す
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions } from "../../../ui/view-hooks"
import { BOOK_CREATE } from "../book-new/book-create"
import { NewBookForm } from "../book-new/NewBookDialog"
import { Dialog } from "../dialog-host/Dialog"
import { kit } from "../kit"
import { LIBRARY_ENTRY_OPEN } from "./commands"

export function LibraryNewBookDialog({ args, onClose }: DialogProps<{ into: string }>) {
  const t = useMessages(kit)
  const { perform } = useActions()
  const open = useCommand(LIBRARY_ENTRY_OPEN.id).run
  return (
    <Dialog title={t("New book")} onClose={onClose}>
      <NewBookForm
        onDone={onClose}
        create={({ title }) => {
          const done = perform(BOOK_CREATE.id, { title, into: args.into, at: "last" })
          if (done.ok) open({ entry: done.result.book })
          return done
        }}
      />
    </Dialog>
  )
}
