// ノードの設定のダイアログ（フォルダもファイルも、根も同じ形）: 名前と説明（どちらも上に装飾のボックス）と、アイコン（フォルダは folder・book、ファイルは file とそれ以外）を選ぶ。
// 確定でアクション node-update を行う。断られたら、閉じずに理由を出す（認可ステップが止めたならそのステップの名前、ほかは紙に入らない）
import { useId, useRef, useState } from "react"
import type { MessageKey } from "../../../plugin-api"
import { type DialogProps, useCoreCatalog, useMessages, usePageById, usePerform, useT } from "../../../plugin-api/ui"
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
import { NODE_UPDATE } from "./actions"
import { nodeOf } from "./edit"
import { kit } from "./kit"
import styles from "./NodeSettingsDialog.module.css"
import { dirRootOf } from "./node"
import { NodeIcon } from "./node-icon"
import { DEFAULT_ICON, iconsFor } from "./node-icon-enum"

export function NodeSettingsDialog({ args, onClose }: DialogProps<{ page: string; node: string }>) {
  const t = useMessages(kit)
  const form = useId()
  const iconGroup = useId() // アイコンのラジオの組の名前
  const page = usePageById(args.page)
  const root = dirRootOf(page)
  const node = root ? nodeOf(root, args.node) : null
  const perform = usePerform()
  const [name, setName] = useState(node?.name ?? "")
  const [description, setDescription] = useState(node?.description ?? "")
  const [icon, setIcon] = useState<string | undefined>(node?.icon)
  const catalog = useCoreCatalog()
  const tr = useT() // ほかのプラグインが足したアイコンの名前も引く
  const [refused, setRefused] = useState<MessageKey | null>(null) // 断られたわけの文言
  if (!page || !node) return null
  const submit = () => {
    const done = perform(
      NODE_UPDATE.id,
      {
        node: node.id,
        name,
        description: description.trim() === "" ? null : description,
        // 変えていないアイコンは送らない（足したプラグインが無効で値が無くても、名前などは直せる）
        ...(icon === node.icon ? {} : { icon: icon ?? null }),
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
            <fieldset className={styles.icons} aria-label={t("Icon")}>
              {iconsFor(catalog, node.kind)
                .sort((x, y) => Number(y.id === DEFAULT_ICON[node.kind]) - Number(x.id === DEFAULT_ICON[node.kind]))
                .map(value => (
                  <label key={value.id} className={styles.icon} title={tr(value.title)}>
                    <input
                      type="radio"
                      className={styles.radio}
                      name={iconGroup}
                      aria-label={tr(value.title)}
                      checked={(icon ?? DEFAULT_ICON[node.kind]) === value.id}
                      onChange={() => setIcon(value.id === DEFAULT_ICON[node.kind] ? undefined : value.id)}
                    />
                    <NodeIcon kind={node.kind} icon={value.id} open={false} size={18} />
                  </label>
                ))}
            </fieldset>
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
