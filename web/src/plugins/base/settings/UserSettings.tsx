// 利用者の設定の並び: 機能台帳の利用者の設定の項目を、プラグインごとに並べる（base の項目が先で見出しなし、ほかは見出しにプラグインの id）。
// 項目のビューがあればそれを、無ければ値の形から作った入力Form（真偽はスイッチ、選択肢はセレクトForm、数と文字はテキストForm）を出し、どちらも作れない項目は出さない。
// 変えるとコマンド settings-set を呼ぶ。コマンドが押せないときと、ホームのタイプが変えさせない項目は、灰色で押せない
import { type ReactNode, useState } from "react"
import type { SettingDef } from "../../../core/def/setting"
import type { MessageKey } from "../../../core/i18n/i18n"
import { splitId } from "../../../core/names"
import { userSetting } from "../../../core/settings"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useInstance, useUiCatalog } from "../../../ui/store-context"
import { useSettings } from "../../../ui/view-hooks"
import { Switch } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { fixedSettingsOf } from "./actions"
import { SETTINGS_SET_COMMAND } from "./commands"
import styles from "./UserSettings.module.css"
import { type AutoInput, autoInputOf } from "./user-settings"

export function UserSettings({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const views = useUiCatalog().userSettingViews
  const { home } = useInstance()
  const { values } = useSettings()
  const set = useCommand(stage, SETTINGS_SET_COMMAND.id)
  const fixed = fixedSettingsOf(catalog, home)
  const groups = new Map<string, ReactNode[]>()
  for (const def of catalog.userSettings.values()) {
    const label = t(def.title)
    const value = userSetting(catalog, values, def.id)
    const onChange = (v: unknown) => set.run({ [def.id]: v === undefined ? null : v })
    const View = views.get(def.id)?.control
    const input = View ? null : autoInputOf(catalog, def)
    if (!View && !input) continue
    const owner = splitId(def.id).owner ?? ""
    groups.set(owner, [
      ...(groups.get(owner) ?? []),
      <fieldset key={def.id} className={styles.item} disabled={!set.enabled || fixed.includes(def.id)}>
        {View ? (
          <View label={label} value={value} onChange={onChange} />
        ) : (
          <div className={styles.row}>
            <span className={styles.label}>{label}</span>
            {input && <AutoControl input={input} def={def} label={label} value={value} onChange={onChange} />}
          </div>
        )}
      </fieldset>,
    ])
  }
  return [...groups].map(([owner, rows]) => (
    <div key={owner}>
      {owner !== kit.id && <h3 className={styles.heading}>{owner}</h3>}
      {rows}
    </div>
  ))
}

// 値の形から作った入力Form
function AutoControl({
  input,
  def,
  label,
  value,
  onChange,
}: {
  input: AutoInput
  def: SettingDef
  label: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  switch (input.kind) {
    case "switch":
      return <Switch label={label} checked={value === true} onChange={checked => onChange(checked)} />
    case "select":
      return <EnumSelect def={def} label={label} options={input.options} value={value} onChange={onChange} />
    case "number":
      return (
        <TextInput
          type="number"
          label={label}
          value={value}
          onCommit={text => onChange(text === "" ? undefined : Number(text))}
        />
      )
    case "text":
      return (
        <TextInput
          type="text"
          label={label}
          value={value}
          onCommit={text => onChange(text === "" ? undefined : text)}
        />
      )
  }
}

function EnumSelect({
  def,
  label,
  options,
  value,
  onChange,
}: {
  def: SettingDef
  label: string
  options: readonly string[]
  value: unknown
  onChange: (value: unknown) => void
}) {
  const t = useMessages(kit)
  return (
    <select
      className={styles.control}
      aria-label={label}
      value={String(value ?? "")}
      onChange={e => onChange(e.target.value)}
    >
      {value === undefined && <option value="" />}
      {options.map(o => {
        const title = def.optionTitles?.[o] as MessageKey | undefined // 文言にあることは組み立てで確かめてある（OPTION_TITLES_CHECK）
        return (
          <option key={o} value={o}>
            {title ? t(title) : o}
          </option>
        )
      })}
    </select>
  )
}

// 文字と数のテキストForm: 打っている間は書き留め、離れるか Enter で変える（断られれば今の値に戻る）。空にすると既定に戻す
function TextInput({
  type,
  label,
  value,
  onCommit,
}: {
  type: "text" | "number"
  label: string
  value: unknown
  onCommit: (text: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null) onCommit(draft)
    setDraft(null)
  }
  return (
    <input
      className={styles.control}
      type={type}
      aria-label={label}
      value={draft ?? (value === undefined ? "" : String(value))}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) commit()
      }}
    />
  )
}
