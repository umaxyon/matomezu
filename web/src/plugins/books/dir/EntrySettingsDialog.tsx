// ノードの設定のダイアログ（フォルダもファイルも、根も同じ形）: 名前と説明（どちらも上に装飾のボックス）と、色をブックのテーマの代表色・好きな色・「なし」（テーマのアイコンの色）から選ぶ。
// 確定でアクション entry-update を行う。断られたら、閉じずに理由を出す（認可ステップが止めたならそのステップの名前、ほかは紙に入らない）
import { useId, useRef, useState } from "react"
import { type MessageKey, pagedOf } from "../../../plugin-api"
import { type DialogProps, useBook, useCoreCatalog, useMessages, usePerform } from "../../../plugin-api/ui"
import { refusalMessage } from "../../base"
import {
  ActionButton,
  ColorPicker,
  controlClass,
  Dialog,
  Field,
  Form,
  Problem,
  RichBar,
  RichInput,
  type RichInputHandle,
  rowClass,
  useBookTheme,
  useSwatches,
} from "../../base/ui"
import { ENTRY_UPDATE } from "./actions"
import { FILE_COLOR, FOLDER_COLOR } from "./dir"
import { entryOf } from "./edit"
import { DirFolderSchema } from "./entry"
import { kit } from "./kit"

export function EntrySettingsDialog({ stage, args, onClose }: DialogProps<{ page: string; entry: string }>) {
  const t = useMessages(kit)
  const form = useId()
  const book = pagedOf(useBook(stage))
  const page = book?.pages.find(p => p.id === args.page)
  const root = DirFolderSchema.safeParse(page && "root" in page ? page.root : undefined)
  const entry = root.success ? entryOf(root.data, args.entry) : null
  const perform = usePerform(stage)
  const swatches = useSwatches(useBookTheme(book?.id), entry?.kind === "file" ? FILE_COLOR : FOLDER_COLOR)
  const [name, setName] = useState(entry?.name ?? "")
  const [description, setDescription] = useState(entry?.description ?? "")
  const [color, setColor] = useState<string | undefined>(entry?.color)
  const catalog = useCoreCatalog()
  const [refused, setRefused] = useState<MessageKey | null>(null) // 断られたわけの文言
  if (!book || !page || !entry) return null
  const submit = () => {
    const done = perform(ENTRY_UPDATE.id, {
      page: page.id,
      entry: entry.id,
      name,
      description: description.trim() === "" ? null : description,
      color: color ?? null,
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
        {swatches && (
          <div className={rowClass}>
            <span>{t("Color")}</span>
            <ColorPicker
              label={t("Color")}
              value={color}
              palette={swatches.palette}
              none={swatches.none}
              onChange={setColor}
            />
          </div>
        )}
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
