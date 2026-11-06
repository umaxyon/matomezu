// Tab キーの設定の項目のビュー: [数 ▾](半角スペース)(Tab) の切り替え。選んでいる方のボタンを押した見た目にする。
// 数を選び替えると、半角スペースを選んでいる間はすぐ効き、Tab 文字を選んでいる間は覚えておくだけ
import { type UserSettingControlProps, useMessages } from "../../../../plugin-api/ui"
import { SelectButton, SettingRow } from "../../../base/ui"
import { kit } from "../kit"
import { TAB_KEY, TAB_KEY_SPACES, type TabKey } from "../tab-key"

export function TabKeySetting({ label, value, onChange }: UserSettingControlProps<TabKey>) {
  const t = useMessages(kit)
  // 値は、無いか形に合わなければ既定にしてから渡される（型の上では、無いこともある）
  const now = value ?? TAB_KEY.default
  return (
    <SettingRow label={label}>
      <SelectButton
        label={t("Number of spaces")}
        value={String(now.spaces)}
        options={TAB_KEY_SPACES.map(n => ({ value: String(n), label: String(n) }))}
        buttons={[
          {
            label: t("Spaces"),
            pressed: now.writes === "spaces",
            onClick: () => onChange({ ...now, writes: "spaces" }),
          },
          { label: t("Tab"), pressed: now.writes === "tab", onClick: () => onChange({ ...now, writes: "tab" }) },
        ]}
        onChange={v => onChange({ ...now, spaces: TAB_KEY_SPACES.find(n => String(n) === v) ?? now.spaces })}
      />
    </SettingRow>
  )
}
