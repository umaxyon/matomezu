// 設定カテゴリ「更新」: 今の版・新しい版（無ければ「最新です」）・確かめた時刻と［更新を確認］・自動で確かめるかのスイッチ。
// 新しい版があれば、端末で打つと更新するコマンド matomezu update を［コピー］付きで出す
import { useEffect, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { SettingRow } from "../settings/SettingRow"
import { UserSettings } from "../settings/UserSettings"
import { shownTime } from "../utils/shown-time"
import { useCopyText } from "../window-io/hooks"
import { useCheckUpdate, useUpdateStatus } from "./hooks"
import { UPDATE_CHECK } from "./setting"
import styles from "./UpdateCategory.module.css"

const COMMAND = "matomezu update"
const COPIED_MS = 1500

type Checking = "idle" | "checking" | "failed"
type Copied = "none" | "done" | "failed"

export function UpdateCategory() {
  const t = useMessages(kit)
  const status = useUpdateStatus()
  const check = useCheckUpdate()
  const copyText = useCopyText()
  const [checking, setChecking] = useState<Checking>("idle")
  const [copied, setCopied] = useState<Copied>("none")
  useEffect(() => {
    if (copied === "none") return
    const timer = setTimeout(() => setCopied("none"), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  if (!status) return null
  const dev = status.state === "dev"
  const failed = checking === "failed" || status.state === "failed"
  const latest =
    status.state === "newer"
      ? (status.latest ?? "")
      : status.state === "current"
        ? t("Up to date")
        : dev
          ? t("Development build")
          : failed
            ? t("Could not check")
            : t("Not checked yet")
  const onCheck = () => {
    setChecking("checking")
    check().then(
      () => setChecking("idle"),
      () => setChecking("failed"),
    )
  }
  return (
    <div>
      <SettingRow label={t("This version")}>
        <span className={styles.value}>{status.version}</span>
      </SettingRow>
      <SettingRow label={t("Newest version")}>
        <span className={styles.value} data-newer={status.state === "newer" || undefined}>
          {latest}
        </span>
      </SettingRow>
      <SettingRow label={t("Checked")}>
        <span className={styles.value}>{status.checkedAt ? shownTime(status.checkedAt, new Date()) : "—"}</span>
        <ActionButton disabled={dev || checking === "checking"} onClick={onCheck}>
          {checking === "checking" ? t("Checking…") : t("Check for updates")}
        </ActionButton>
      </SettingRow>
      <UserSettings settings={[UPDATE_CHECK.id]} />
      {status.state === "newer" && (
        <SettingRow label={t("Update")}>
          <div className={styles.update}>
            <span>{t("Type this in a terminal to update")}</span>
            <span className={styles.command}>
              <code>{COMMAND}</code>
              <ActionButton
                onClick={() =>
                  void copyText(COMMAND).then(
                    () => setCopied("done"),
                    () => setCopied("failed"),
                  )
                }
              >
                {t(COPY_LABELS[copied])}
              </ActionButton>
            </span>
          </div>
        </SettingRow>
      )}
    </div>
  )
}

const COPY_LABELS = { none: "Copy", done: "Copied", failed: "Could not copy" } as const
