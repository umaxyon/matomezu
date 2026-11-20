// ブックを作るダイアログ: 名前を決めて作り（アクション book-create）、そのステージで開く。
// 出来るのはページの無いブック（ブックはタイプを持たない。ページは、開いたあとにページタブの＋から、タイプを選んで足す）

import { useState } from "react"
import type { Performed } from "../../../store/actions"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { Dialog } from "../dialog-host/Dialog"
import { controlClass, Field, Form, Problem } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { titleTaken } from "../utils/refusal"
import type { BOOK_CREATE } from "./book-create"
import { useCreateBook } from "./useCreateBook"

export function NewBookDialog({ onClose }: DialogProps) {
  const t = useMessages(kit)
  return (
    <Dialog title={t("New book")} onClose={onClose}>
      <NewBookForm onDone={onClose} create={useCreateBook()} />
    </Dialog>
  )
}

// 名前を決めて作る入力Form。create が作って開く（結果を返す。作る所が無ければ null）
export function NewBookForm({
  onDone,
  create: createAndOpen,
}: {
  onDone: () => void
  create: (args: { title: string }) => Performed<typeof BOOK_CREATE.id> | null
}) {
  const t = useMessages(kit)
  const [title, setTitle] = useState("")
  const [taken, setTaken] = useState(false) // 同じ名前の物が在って、断られた
  return (
    <Form
      submit={t("Create")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        const done = createAndOpen({ title })
        if (done?.ok) onDone()
        else setTaken(done !== null && titleTaken(done))
      }}
    >
      <Field label={t("Book name")}>
        {id => (
          // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の入力Form
          <input id={id} className={controlClass} value={title} autoFocus onChange={e => setTitle(e.target.value)} />
        )}
      </Field>
      {taken && <Problem>{t("The name is taken")}</Problem>}
    </Form>
  )
}
