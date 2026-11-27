// コンテキストの棒の物差し（利用者の設定の項目 context-scale）のビュー: 自動と決まった量から選ぶセレクトForm。名前の右に説明の「？」。
// 値が数なので、文字の選択肢から作る入力Form（autoInputOf）は使えない
import { NOT_SET } from "../../../core/def/setting"
import type { MessageKey } from "../../../core/i18n/i18n"
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { kit } from "../kit"
import { SettingRow } from "../settings/SettingRow"
import styles from "../settings/UserSettings.module.css"
import { CONTEXT_SCALE, CONTEXT_SCALE_CHOICES, type ContextScale, contextScaleOf } from "./context-gauge"

const OPTIONS: readonly ContextScale[] = ["auto", ...CONTEXT_SCALE_CHOICES]

export function ContextScaleSetting({ label, help, value, onChange }: UserSettingControlProps<ContextScale>) {
  const t = useMessages(kit)
  const shown = contextScaleOf(value === NOT_SET ? "auto" : value)
  return (
    <SettingRow label={label} help={help} as="label">
      <select
        className={styles.control}
        aria-label={label}
        value={String(shown)}
        onChange={e => onChange(contextScaleOf(e.target.value === "auto" ? "auto" : Number(e.target.value)))}
      >
        {OPTIONS.map(o => {
          const title = CONTEXT_SCALE.optionTitles?.[String(o)] as MessageKey | undefined // 文言にあることは台帳アセンブルで確かめてある（OPTION_TITLES_CHECK）
          return (
            <option key={o} value={String(o)}>
              {title ? t(title) : String(o)}
            </option>
          )
        })}
      </select>
    </SettingRow>
  )
}
