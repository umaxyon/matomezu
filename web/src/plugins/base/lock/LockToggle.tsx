// ロックの切り替えのボタン（設定のダイアログの見出しの右に置く）: 鍵のアイコンで今の値を見せ、押すと掛ける・外すを切り替える
import { LockIcon } from "./LockIcon"
import styles from "./LockToggle.module.css"

export function LockToggle({
  locked,
  label,
  onChange,
}: {
  locked: boolean
  label: string // ボタンの名前（読み上げと、ポインタを乗せたときに出す）
  onChange: (locked: boolean) => void
}) {
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={label}
      aria-pressed={locked}
      title={label}
      onClick={() => onChange(!locked)}
    >
      <LockIcon open={!locked} />
    </button>
  )
}
