// ブックを作るダイアログ: 名前とタイプを決めて作り（アクション book.create）、そのステージで開く
import { useState } from "react"
import { creatableTypes } from "../../core/book"
import { bookType } from "../../core/registry"
import { useT } from "../i18n"
import { useActions, useRegistry } from "../store-context"
import { Dialog } from "./Dialog"
import { controlClass, Field, Form } from "./FormParts"
import type { DialogProps } from "./views"

export function NewBookDialog({ stage, onClose }: DialogProps) {
  const t = useT()
  return (
    <Dialog title={t("新しいブック")} onClose={onClose}>
      <NewBookForm stage={stage} onDone={onClose} />
    </Dialog>
  )
}

function NewBookForm({ stage, onDone }: { stage: string; onDone: () => void }) {
  const { createBook } = useActions()
  const t = useT()
  const [title, setTitle] = useState("")
  const registry = useRegistry()
  const types = creatableTypes(registry)
  const [type, setType] = useState(types[0] ?? "")
  return (
    <Form
      submit={t("作成")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        if (createBook(stage, { title, type })) onDone()
      }}
    >
      <Field label={t("ブックの名前")}>
        {id => (
          // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の欄
          <input id={id} className={controlClass} value={title} autoFocus onChange={e => setTitle(e.target.value)} />
        )}
      </Field>
      <Field label={t("ブックのタイプ")}>
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
                {t(bookType(registry, c).title)}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Form>
  )
}
