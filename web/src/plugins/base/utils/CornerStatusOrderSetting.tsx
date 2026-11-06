// コーナーステータスの並び（利用者の設定の項目 corner-status-order）のビュー: コーナーステータスを今の並びで出し、行ごとの前へ・後ろへのボタンで 1 つずつ入れ替える
import type { MessageKey } from "../../../core/i18n/i18n"
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { useUiCatalog } from "../../../ui/store-context"
import { rowClass, Section } from "../dialog-host/FormParts"
import { kit } from "../kit"
import styles from "./CornerStatusOrderSetting.module.css"
import { useCornerStatuses } from "./corner"
import { movedStatus } from "./corner-order"

export function CornerStatusOrderSetting({ label, onChange }: UserSettingControlProps<readonly string[]>) {
  const t = useMessages(kit)
  const widgets = useUiCatalog().widgets
  const { statuses, chosen, placed } = useCornerStatuses()
  const title = (status: string) => {
    const key: MessageKey | undefined = widgets.get(status)?.cornerStatus?.title
    return key ? t(key) : status
  }
  const move = (status: string, by: -1 | 1) => onChange(movedStatus(chosen, placed, status, by))
  return (
    <Section title={label}>
      <ol className={styles.list}>
        {statuses.map((status, i) => (
          <li key={status} className={`${rowClass} ${styles.row}`}>
            <span className={styles.name}>{title(status)}</span>
            <button
              type="button"
              className={styles.move}
              aria-label={t("Move {name} up", { name: title(status) })}
              disabled={i === 0}
              onClick={() => move(status, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={styles.move}
              aria-label={t("Move {name} down", { name: title(status) })}
              disabled={i === statuses.length - 1}
              onClick={() => move(status, 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
    </Section>
  )
}
