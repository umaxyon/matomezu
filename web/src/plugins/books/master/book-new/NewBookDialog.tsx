// ブックを作るダイアログ: 名前とタイプを決めて作り（アクション book.create）、そのステージで開く
import { useState } from "react"
import { creatableTypes } from "../../../../core/book"
import { bookType } from "../../../../core/core-catalog"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useCatalog } from "../../../../ui/store-context"
import { controlClass, Dialog, Field, Form } from "../../../base/ui"

export function NewBookDialog({ stage, onClose }: DialogProps) {
  const t = useT()
  return (
    <Dialog title={t("New book")} onClose={onClose}>
      <NewBookForm stage={stage} onDone={onClose} />
    </Dialog>
  )
}

function NewBookForm({ stage, onDone }: { stage: string; onDone: () => void }) {
  const { createBook } = useActions()
  const t = useT()
  const [title, setTitle] = useState("")
  const catalog = useCatalog().core
  const types = creatableTypes(catalog)
  const [type, setType] = useState(types[0] ?? "")
  return (
    <Form
      submit={t("Create")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        // 選べるタイプは動いている機能台帳から来る（型の側に無い追加プラグインのタイプもある）ので、型を外して渡す
        if (createBook(stage, { title, type: type as never })) onDone()
      }}
    >
      <Field label={t("Book name")}>
        {id => (
          // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の欄
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
