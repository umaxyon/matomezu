// ノードの設定のダイアログ（フォルダもファイルも、根も同じ形）: 名前と説明（どちらも上に装飾のボックス）と、アイコン（フォルダは folder・book、ファイルは file とそれ以外）を選ぶ。
// 確定でアクション entry-update を行う。断られたら、閉じずに理由を出す（認可ステップが止めたならそのステップの名前、ほかは紙に入らない）
import { useId, useRef, useState } from "react"
import { type MessageKey, pagedOf } from "../../../plugin-api"
import { type DialogProps, useBook, useCoreCatalog, useMessages, usePerform } from "../../../plugin-api/ui"
import { refusalMessage } from "../../base"
import {
  ActionButton,
  controlClass,
  Dialog,
  Field,
  Form,
  Problem,
  RichBar,
  RichInput,
  type RichInputHandle,
  rowClass,
} from "../../base/ui"
import { ENTRY_UPDATE } from "./actions"
import styles from "./EntrySettingsDialog.module.css"
import { entryOf } from "./edit"
import { dirRootOf, FILE_ICONS, FOLDER_ICONS, type Icon } from "./entry"
import { kit } from "./kit"
import { NodeIcon } from "./node-icon"

export function EntrySettingsDialog({ stage, args, onClose }: DialogProps<{ page: string; entry: string }>) {
  const t = useMessages(kit)
  const form = useId()
  const book = pagedOf(useBook(stage))
  const page = book?.pages.find(p => p.id === args.page)
  const root = dirRootOf(page)
  const entry = root ? entryOf(root, args.entry) : null
  const perform = usePerform(stage)
  const [name, setName] = useState(entry?.name ?? "")
  const [description, setDescription] = useState(entry?.description ?? "")
  const [icon, setIcon] = useState<Icon | undefined>(entry?.icon)
  const catalog = useCoreCatalog()
  const [refused, setRefused] = useState<MessageKey | null>(null) // 断られたわけの文言
  if (!book || !page || !entry) return null
  const submit = () => {
    const done = perform(ENTRY_UPDATE.id, {
      page: page.id,
      entry: entry.id,
      name,
      description: description.trim() === "" ? null : description,
      icon: icon ?? null,
    })
    if (done.ok) onClose()
    else setRefused(refusalMessage(catalog, done, kit.message("Does not fit on the paper")))
  }
  return (
    <Dialog
      title={t("Node settings")}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary>
            {t("OK")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready={name.trim() !== ""} onSubmit={submit}>
        <Field label={t("Name")}>
          {id => <RichLineInput id={id} stage={stage} label={t("Name")} value={name} onChange={setName} autoFocus />}
        </Field>
        <Field label={t("Description")}>
          {id => (
            <RichLineInput
              id={id}
              stage={stage}
              label={t("Description")}
              value={description}
              onChange={setDescription}
            />
          )}
        </Field>
        <div className={rowClass}>
          <span>{t("Icon")}</span>
          <div className={styles.icons} role="radiogroup" aria-label={t("Icon")}>
            {(entry.kind === "file" ? FILE_ICONS : FOLDER_ICONS).map((name, i) => (
              <button
                key={name}
                type="button"
                role="radio"
                className={styles.icon}
                aria-checked={(icon ?? (i === 0 ? name : undefined)) === name}
                aria-label={t(ICON_NAMES[name])}
                title={t(ICON_NAMES[name])}
                onClick={() => setIcon(i === 0 ? undefined : name)}
              >
                <NodeIcon kind={entry.kind} icon={name} open={false} size={18} />
              </button>
            ))}
          </div>
        </div>
        {refused && <Problem>{t(refused)}</Problem>}
      </Form>
    </Dialog>
  )
}

// 1 行の見たまま編集の入力Formと、その上の装飾のボックス
function RichLineInput({
  id,
  stage,
  label,
  value,
  onChange,
  autoFocus,
}: {
  id: string
  stage: string
  label: string
  value: string
  onChange: (text: string) => void
  autoFocus?: boolean
}) {
  const ref = useRef<RichInputHandle>(null)
  return (
    <div>
      <RichBar stage={stage} target={ref} />
      <RichInput
        ref={ref}
        stage={stage}
        id={id}
        label={label}
        multiline={false}
        className={controlClass}
        value={value}
        autoFocus={autoFocus}
        onChange={onChange}
      />
    </div>
  )
}

// アイコンの名前（選ぶボタンの名前）
const ICON_NAMES = {
  folder: "Folder",
  book: "Book",
  file: "File",
  drawing: "Drawing",
  flowchart: "Flowchart",
  tree: "Tree",
  directory: "Directory icon",
  markdown: "Markdown",
  slide: "Slide",
  "class-diagram": "Class diagram",
  html: "HTML",
} as const
