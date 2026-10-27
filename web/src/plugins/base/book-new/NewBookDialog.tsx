// ブックを作るダイアログ: 名前とタイプを決めて作り（アクション book-create）、そのステージで開く
import { useState } from "react"
import { creatableTypes } from "../../../core/book"
import { bookType } from "../../../core/core-catalog"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useInstance } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { controlClass, Field, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { createBookIn } from "./create-book"

export function NewBookDialog({ stage, onClose }: DialogProps) {
  const t = useMessages(kit)
  return (
    <Dialog title={t("New book")} onClose={onClose}>
      <NewBookForm stage={stage} onDone={onClose} />
    </Dialog>
  )
}

function NewBookForm({ stage, onDone }: { stage: string; onDone: () => void }) {
  const instance = useInstance()
  const t = useMessages(kit)
  const [title, setTitle] = useState("")
  const catalog = useCoreCatalog()
  const types = creatableTypes(catalog)
  const [type, setType] = useState(types[0] ?? "")
  return (
    <Form
      submit={t("Create")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        // 選べるタイプは動いている機能台帳から来る（core/catalog.ts に無い追加プラグインのタイプもある）ので、型を外して渡す
        if (createBookIn(instance, stage, { title, type: type as never })) onDone()
      }}
    >
      <Field label={t("Book name")}>
        {id => (
          // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の入力Form
          <input id={id} className={controlClass} value={title} autoFocus onChange={e => setTitle(e.target.value)} />
        )}
      </Field>
      <Field label={t("Book type")}>
        {id => (
          <select
            id={id}
            className={controlClass}
            value={type}
            disabled={types.length < 2}
            onChange={e => setType(e.target.value)}
          >
            {types.map(c => (
              <option key={c} value={c}>
                {t(bookType(catalog, c).title)}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Form>
  )
}
