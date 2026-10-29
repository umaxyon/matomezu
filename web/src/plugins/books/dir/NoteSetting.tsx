// 説明の見せ方の設定のコンポーネント（設定の項目 notes-shown・note-dots・note-divider のビュー）: 名前と、その右のスイッチ 1 つ。
// 既定の値に戻すと、ページに書いた値を消す
import type { SettingControlProps } from "../../../plugin-api/ui"
import { rowClass, Switch } from "../../base/ui"

export function NoteSetting({ label, value, inherited, onChange }: SettingControlProps<boolean>) {
  const fallback = inherited ?? false
  return (
    <div className={rowClass}>
      <span>{label}</span>
      <Switch label={label} checked={value ?? fallback} onChange={v => onChange(v === fallback ? undefined : v)} />
    </div>
  )
}
