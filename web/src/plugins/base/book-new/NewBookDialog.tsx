// ブックを作るダイアログ: 名前を決めて作り（アクション book-create）、そのステージで開く。
// 出来るのはページの無いブック（ブックはタイプを持たない。ページは、開いたあとにページタブの＋から、タイプを選んで足す）

import { useState } from "react"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { Dialog } from "../dialog-host/Dialog"
import { controlClass, Field, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useCreateBook } from "./useCreateBook"

export function NewBookDialog({ onClose }: DialogProps) {
  const t = useMessages(kit)
  return (
    <Dialog title={t("New book")} onClose={onClose}>
      <NewBookForm onDone={onClose} />
    </Dialog>
  )
}

function NewBookForm({ onDone }: { onDone: () => void }) {
  const t = useMessages(kit)
  const createAndOpen = useCreateBook()
  const [title, setTitle] = useState("")
  return (
    <Form
      submit={t("Create")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        if (createAndOpen({ title })) onDone()
      }}
    >
      <Field label={t("Book name")}>
        {id => (
          // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の入力Form
          <input id={id} className={controlClass} value={title} autoFocus onChange={e => setTitle(e.target.value)} />
        )}
      </Field>
    </Form>
  )
}
