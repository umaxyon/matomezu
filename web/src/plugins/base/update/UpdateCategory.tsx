// 設定カテゴリ「更新」: 今の版・新しい版（無ければ「最新です」）・確かめた時刻と［更新を確認］・自動で確かめるかのスイッチ。
// 新しい版があれば、管理者のワークルームに生きている AI がいれば［管理者（名前）に更新を頼む］（頼んだら「頼みました 時刻」）、
// いなければ、端末で打つと更新するコマンド matomezu update（Windows で npm から入れたなら matomezu.cmd update）を［コピー］付きで出す
import { useEffect, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useIsAlive, useWorkroomRows } from "../participant/hooks"
import { SettingRow } from "../settings/SettingRow"
import { UserSettings } from "../settings/UserSettings"
import { shownTime } from "../utils/shown-time"
import { useCopyText, useMatomezuCommand } from "../window-io/hooks"
import {
  NO_LATEST,
  NO_UPDATE_STATUS,
  NOT_ASKED,
  NOT_CHECKED,
  useAskUpdate,
  useCheckUpdate,
  useUpdateStatus,
} from "./hooks"
import { UPDATE_CHECK } from "./setting"
import styles from "./UpdateCategory.module.css"

const COPIED_MS = 1500

type Checking = "idle" | "checking" | "failed"
type Copied = "none" | "done" | "failed"
// 管理者に頼んだ様子: 頼んでいる途中・頼めなかった（常駐が断った）・そこに AI がいなかった
type Asking = "idle" | "asking" | "failed" | "nobody"

export function UpdateCategory() {
  const t = useMessages(kit)
  const status = useUpdateStatus()
  const check = useCheckUpdate()
  const copyText = useCopyText()
  const command = `${useMatomezuCommand()} update`
  const [checking, setChecking] = useState<Checking>("idle")
  const [copied, setCopied] = useState<Copied>("none")
  const ask = useAskUpdate()
  const [asking, setAsking] = useState<Asking>("idle")
  const isAlive = useIsAlive()
  const admin = useWorkroomRows().find(r => r.admin)
  const adminHere = admin?.state === "ready" && isAlive(admin.calledAt, Date.now()) && asking !== "nobody"
  useEffect(() => {
    if (copied === "none") return
    const timer = setTimeout(() => setCopied("none"), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  if (status === NO_UPDATE_STATUS) return null
  const dev = status.state === "dev"
  const latest =
    status.state === "newer"
      ? status.latest === NO_LATEST
        ? ""
        : status.latest
      : status.state === "current"
        ? t("Up to date")
        : dev
          ? t("Development build")
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
        <span className={styles.value}>
          {status.checkedAt !== NOT_CHECKED ? shownTime(status.checkedAt, new Date()) : "—"}
        </span>
        <ActionButton disabled={dev || checking === "checking"} onClick={onCheck}>
          {checking === "checking" ? t("Checking…") : t("Check for updates")}
        </ActionButton>
        {checking === "failed" && <span>{t("Could not check")}</span>}
      </SettingRow>
      <UserSettings settings={[UPDATE_CHECK.id]} />
      {status.state === "newer" && admin && adminHere && (
        <SettingRow label={t("Update")}>
          <div className={styles.update}>
            <span className={styles.command}>
              <ActionButton
                primary
                disabled={asking === "asking"}
                onClick={() => {
                  setAsking("asking")
                  ask(admin.room.id).then(
                    there => setAsking(there ? "idle" : "nobody"),
                    () => setAsking("failed"),
                  )
                }}
              >
                {t("Ask {name} (the administrator) to update", { name: admin.room.name })}
              </ActionButton>
              {status.askedAt !== NOT_ASKED && (
                <span>{t("Asked {time}", { time: shownTime(status.askedAt, new Date()) })}</span>
              )}
            </span>
            {asking === "failed" && <span>{t("Could not ask")}</span>}
          </div>
        </SettingRow>
      )}
      {status.state === "newer" && !adminHere && (
        <SettingRow label={t("Update")}>
          <div className={styles.update}>
            <span>{t("Type this in a terminal to update")}</span>
            <span className={styles.command}>
              <code>{command}</code>
              <ActionButton
                onClick={() =>
                  void copyText(command).then(
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
