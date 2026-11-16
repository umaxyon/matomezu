// ノードの設定のダイアログ（フォルダもファイルも、根も同じ形）: 名前と説明（どちらも上に装飾のボックス）と、アイコン（フォルダは folder・book、ファイルは file とそれ以外）を選ぶ。
// 確定でアクション entry-update を行う。断られたら、閉じずに理由を出す（認可ステップが止めたならそのステップの名前、ほかは紙に入らない）
import { useId, useRef, useState } from "react"
import { findPage, type MessageKey } from "../../../plugin-api"
import { type DialogProps, useBook, useCoreCatalog, useMessages, usePerform, useT } from "../../../plugin-api/ui"
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
} from "../../base/ui"
import { ENTRY_UPDATE } from "./actions"
import styles from "./EntrySettingsDialog.module.css"
import { entryOf } from "./edit"
import { dirRootOf } from "./entry"
import { DEFAULT_ICON, iconsFor } from "./entry-icon"
import { kit } from "./kit"
import { NodeIcon } from "./node-icon"

export function EntrySettingsDialog({ args, onClose }: DialogProps<{ page: string; entry: string }>) {
  const t = useMessages(kit)
  const form = useId()
  const book = useBook()
  const page = book ? findPage(book, args.page)?.page : undefined
  const root = dirRootOf(page)
  const entry = root ? entryOf(root, args.entry) : null
  const perform = usePerform()
  const [name, setName] = useState(entry?.name ?? "")
  const [description, setDescription] = useState(entry?.description ?? "")
  const [icon, setIcon] = useState<string | undefined>(entry?.icon)
  const catalog = useCoreCatalog()
  const tr = useT() // ほかのプラグインが足したアイコンの名前も引く
  const [refused, setRefused] = useState<MessageKey | null>(null) // 断られたわけの文言
  if (!book || !page || !entry) return null
  const submit = () => {
    const done = perform(
      ENTRY_UPDATE.id,
      {
        entry: entry.id,
        name,
        description: description.trim() === "" ? null : description,
        // 変えていないアイコンは送らない（足したプラグインが無効で値が無くても、名前などは直せる）
        ...(icon === entry.icon ? {} : { icon: icon ?? null }),
      },
      { page: page.id },
    )
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
          {id => <RichLineInput id={id} label={t("Name")} value={name} onChange={setName} autoFocus />}
        </Field>
        <Field label={t("Description")}>
          {id => <RichLineInput id={id} label={t("Description")} value={description} onChange={setDescription} />}
        </Field>
        <Field label={t("Icon")}>
          {() => (
            <div className={styles.icons} role="radiogroup" aria-label={t("Icon")}>
              {iconsFor(catalog, entry.kind)
                .sort((x, y) => Number(y.id === DEFAULT_ICON[entry.kind]) - Number(x.id === DEFAULT_ICON[entry.kind]))
                .map(value => (
                  <button
                    key={value.id}
                    type="button"
                    role="radio"
                    className={styles.icon}
                    aria-checked={(icon ?? DEFAULT_ICON[entry.kind]) === value.id}
                    aria-label={tr(value.title)}
                    title={tr(value.title)}
                    onClick={() => setIcon(value.id === DEFAULT_ICON[entry.kind] ? undefined : value.id)}
                  >
                    <NodeIcon kind={entry.kind} icon={value.id} open={false} size={18} />
                  </button>
                ))}
            </div>
          )}
        </Field>
        {refused && <Problem>{t(refused)}</Problem>}
      </Form>
    </Dialog>
  )
}

// 1 行の見たまま編集の入力Formと、その上の装飾のボックス
function RichLineInput({
  id,
  label,
  value,
  onChange,
  autoFocus,
}: {
  id: string
  label: string
  value: string
  onChange: (text: string) => void
  autoFocus?: boolean
}) {
  const ref = useRef<RichInputHandle>(null)
  return (
    <div>
      <RichBar target={ref} />
      <RichInput
        ref={ref}
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
