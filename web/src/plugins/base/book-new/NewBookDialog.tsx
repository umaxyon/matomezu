// ブックを作るダイアログ: 名前とタイプを決めて作り（アクション book-create）、そのステージで開く。
// タイプが作るときに聞く設定の項目（createSettings）を選んでいれば、そのタイプを選んだときに項目を開いて見せ（アコーディオン）、決めた値も一緒に渡す
import { useEffect, useMemo, useState } from "react"
import { creatableTypes, createBook } from "../../../core/book"
import { bookType } from "../../../core/core-catalog"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useInstance } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { controlClass, Field, Form, Section } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { type SettingsPatch, useSettingControls } from "../utils/SettingControls"
import { createBookIn } from "./create-book"
import styles from "./NewBookDialog.module.css"

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
  const [settings, setSettings] = useState<SettingsPatch>({})
  const asks = type ? (bookType(catalog, type).createSettings ?? []) : []
  return (
    <Form
      submit={t("Create")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        // 選べるタイプは動いている機能台帳から来る（core/catalog.ts に無い追加プラグインのタイプもある）ので、型を外して渡す
        const chosen = asks.length > 0 && Object.keys(settings).length > 0 ? { settings } : {}
        if (createBookIn(instance, stage, { title, type: type as never, ...chosen })) onDone()
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
            onChange={e => {
              setType(e.target.value)
              setSettings({})
            }}
          >
            {types.map(c => (
              <option key={c} value={c}>
                {t(bookType(catalog, c).title)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className={styles.more} data-open={asks.length > 0}>
        <div className={styles.inner}>
          {asks.length > 0 && <CreateSettingsInputs key={type} type={type} asks={asks} onChange={setSettings} />}
        </div>
      </div>
    </Form>
  )
}

// タイプ type が作るときに聞く設定の項目 asks の入力（タイプを替えれば初めから）。変えた値を onChange で渡す
function CreateSettingsInputs({
  type,
  asks,
  onChange,
}: {
  type: string
  asks: readonly string[]
  onChange: (settings: SettingsPatch) => void
}) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  // 項目のビューに渡すブック（まだ作っていないので、そのタイプの空のブック）
  const draft = useMemo(() => createBook(catalog, type, { id: "new", title: "" }), [catalog, type])
  const settings = useSettingControls(draft, "book", null, asks)
  useEffect(() => onChange(settings.patch), [settings.patch, onChange])
  return <Section title={t("{type} settings", { type: t(bookType(catalog, type).title) })}>{settings.controls}</Section>
}
