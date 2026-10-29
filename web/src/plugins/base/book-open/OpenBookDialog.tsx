// ブックを開くダイアログ: 探して選んだブックを、そのステージで開く。上の切り替えでゴミ箱の一覧に替えられる（切り替えのボタンにゴミ箱の冊数）。
// ブックの一覧では、ゴミ箱に入れられるブック（1 冊だけのタイプでなく、ブックにもページにもロックが掛かっていない）の行から、アクション book-trash でゴミ箱に入れる

import { useState } from "react"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useCatalog, useMatomezuState } from "../../../ui/store-context"
import { Dialog } from "../dialog-host/Dialog"
import { Choices, ChoiceText } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { BookSearch } from "./BookSearch"
import { BOOK_TRASH, trashable } from "./book-trash"
import { TrashList } from "./TrashList"

export function OpenBookDialog({ stage, onClose }: DialogProps) {
  const { openBook, perform } = useActions()
  const catalog = useCatalog().core
  const count = useMatomezuState(s => Object.keys(s.trash).length)
  const t = useMessages(kit)
  const [view, setView] = useState<"books" | "trash">("books")
  return (
    <Dialog title={t("Open book")} onClose={onClose}>
      <div>
        <Choices
          label={t("Open book")}
          value={view}
          onChange={setView}
          options={[
            { value: "books", label: t("Books"), icon: <ChoiceText>{t("Books")}</ChoiceText> },
            {
              value: "trash",
              label: t("Trash"),
              icon: <ChoiceText>{t("Trash {count}", { count: `${count}` })}</ChoiceText>,
            },
          ]}
        />
      </div>
      {view === "books" ? (
        <BookSearch
          autoFocus
          onSelect={book => {
            openBook(stage, book)
            onClose()
          }}
          canTrash={b => trashable(catalog, b)}
          onTrash={book => perform(BOOK_TRASH.id, { book })}
        />
      ) : (
        <TrashList />
      )}
    </Dialog>
  )
}
