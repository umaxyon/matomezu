// 中身の設定のダイアログ（フォルダもファイルも、根も同じ形）: 名前（上に装飾のボックス）と色を、ブックのテーマの代表色・好きな色・「なし」（テーマのアイコンの色）から選ぶ。
// 確定でアクション entry-update を行う。断られたら、閉じずに理由を出す（許可の段が止めたならその段の名前、ほかは紙に入らない）
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
  const [color, setColor] = useState<string | undefined>(entry?.color)
  const catalog = useCoreCatalog()
  const [refused, setRefused] = useState<MessageKey | null>(null) // 断られたわけの文言
  const input = useRef<HTMLInputElement>(null)
  if (!book || !page || !entry) return null
  const submit = () => {
    const done = perform(ENTRY_UPDATE.id, { page: page.id, entry: entry.id, name, color: color ?? null })
    if (done.ok) onClose()
    else setRefused(refusalMessage(catalog, done, kit.message("Does not fit on the paper")))
  }
  return (
    <Dialog
      title={t(entry.kind === "file" ? "File settings" : "Folder settings")}
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
          {id => (
            <div>
              <RichBar
                stage={stage}
                target={input}
                value={name}
                maxLength={Number.POSITIVE_INFINITY}
                onChange={setName}
              />
              <input
                ref={input}
                id={id}
                className={controlClass}
                value={name}
                autoFocus
                onChange={e => setName(e.target.value)}
              />
            </div>
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
