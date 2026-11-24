// ペアリングしたホストの AI ラリーの回数制限（「このホストの様子」のダイアログの 1 行）: 数を入れて Enter か入力を離れたら書き、
// 範囲の内の整数でなければ書かずに入力の下に一言。替えられない（利用者でない）ときは数だけを見せる
import { useState } from "react"
import { PAIRED_HOST_RALLY_LIMIT } from "../../plugin-api"
import { useActions, useAllowedOn, useMessages } from "../../plugin-api/ui"
import { kit } from "./kit"
import styles from "./OtherHosts.module.css"
import { PAIRED_HOST_RALLY_LIMIT_SET, rallyLimitOf } from "./pairing"

export function RallyLimitField({ id, value }: { id: string; value: number }) {
  const t = useMessages(kit)
  const { perform } = useActions()
  const canSet = useAllowedOn(PAIRED_HOST_RALLY_LIMIT_SET.id, { rallyLimit: value }, { record: id }).ok
  const [draft, setDraft] = useState<string | null>(null)
  const [wrong, setWrong] = useState(false)
  const range = { min: PAIRED_HOST_RALLY_LIMIT.min, max: PAIRED_HOST_RALLY_LIMIT.max }
  const commit = () => {
    if (draft === null) return
    const n = rallyLimitOf(draft)
    if (n === null) {
      setWrong(true)
      return
    }
    setWrong(false)
    setDraft(null)
    if (n !== value) perform(PAIRED_HOST_RALLY_LIMIT_SET.id, { rallyLimit: n }, { record: id })
  }
  return (
    <>
      <dt>{t("AI rally limit:")}</dt>
      <dd className={styles.rally}>
        <span>
          {canSet ? (
            <input
              className={styles.rallyInput}
              type="number"
              min={range.min}
              max={range.max}
              aria-label={t("AI rally limit:")}
              aria-invalid={wrong}
              value={draft ?? String(value)}
              onChange={e => {
                setDraft(e.target.value)
                setWrong(false)
              }}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) commit()
              }}
            />
          ) : (
            value
          )}{" "}
          {t("round trips")}
        </span>
        {wrong ? (
          <span className={styles.warnLine}>{t("From {min} to {max}", range)}</span>
        ) : (
          <span className={styles.hint}>
            {t(
              "How far an AI of this host and an AI here may go on without either user talking to them ({min} to {max})",
              range,
            )}
          </span>
        )}
      </dd>
    </>
  )
}
