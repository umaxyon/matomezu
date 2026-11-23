// 節「ネットワーク設定」: 見出しの線、ホスト名とほかのホストとつなぐかの項目。つなぐが入なら、待っている所（番地ごとに［コピー］）とこのホストの鍵の印、
// 入口を開けなければその 1 行。WSL で動いているときだけ、ほかのマシンから届かせる設定の案内の 1 行と、開くと出る手引き
import { useEffect, useState } from "react"
import { type UserSettingControlProps, useMessages, useSettings } from "../../plugin-api/ui"
import { ActionButton, SettingRow, TextSettingControl, UserSettings, useCopyText, useHostStatus } from "../base/ui"
import { kit } from "./kit"
import styles from "./NetworkSection.module.css"
import { CONNECT_HOSTS, HOST_NAME } from "./settings"

const COPIED_MS = 1500
// 鍵の印に見せる桁数（ホスト id の頭から）
const SHOWN_DIGITS = 16

// 鍵の印: ホスト id の頭 16 桁を大文字で 4 桁ずつ区切り、続きがあることを … で示す（例 7F3A 91C2 0B5E D4A8 …）
export const shownHostKey = (hostId: string): string =>
  `${(
    hostId
      .slice(0, SHOWN_DIGITS)
      .toUpperCase()
      .match(/.{1,4}/g) ?? []
  ).join(" ")} …`

export function NetworkSection() {
  const t = useMessages(kit)
  const status = useHostStatus()
  const { values } = useSettings()
  const on = values[CONNECT_HOSTS.id] === true
  return (
    <section>
      <h4 className={styles.heading}>{t("Network settings")}</h4>
      <UserSettings settings={[HOST_NAME.id, CONNECT_HOSTS.id]} />
      {on && status?.open && (
        <div className={styles.rows}>
          <SettingRow label={t("Listening at")}>
            <span className={styles.addrs}>
              {(status.addrs ?? []).map(a => (
                <Address key={a} text={`${a}:${status.port}`} />
              ))}
            </span>
          </SettingRow>
          <SettingRow label={t("Host key")}>
            <code className={styles.key}>{shownHostKey(status.hostId)}</code>
          </SettingRow>
        </div>
      )}
      {on && status?.failed && <p className={styles.note}>{t("Could not open the entrance for other hosts")}</p>}
      {status?.wsl && <WslGuide port={status.port} />}
    </section>
  )
}

function Address({ text }: { text: string }) {
  const t = useMessages(kit)
  const copyText = useCopyText()
  const [copied, setCopied] = useState<"none" | "done" | "failed">("none")
  useEffect(() => {
    if (copied === "none") return
    const timer = setTimeout(() => setCopied("none"), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <span className={styles.addr}>
      <code>{text}</code>
      <ActionButton
        onClick={() =>
          void copyText(text).then(
            () => setCopied("done"),
            () => setCopied("failed"),
          )
        }
      >
        {t(COPY_LABELS[copied])}
      </ActionButton>
    </span>
  )
}

const COPY_LABELS = { none: "Copy", done: "Copied", failed: "Could not copy" } as const

// WSL の案内: ほかのマシンから届かせるには、WSL のネットワークをミラーにし、Hyper-V のファイアウォールにポートを通す（matomezu は自動では設定しない。
// 効かせるのに WSL の起動し直しが要り、AI のセッションごと止まるため）
function WslGuide({ port }: { port: number | undefined }) {
  const t = useMessages(kit)
  const rule = `New-NetFirewallHyperVRule -Name matomezu -DisplayName matomezu -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts ${port ?? "<port>"}`
  return (
    <div className={styles.note}>
      <p>{t("On WSL, other machines cannot reach this host until WSL is set up for it")}</p>
      <details>
        <summary>{t("How to set up")}</summary>
        <ol className={styles.steps}>
          <li>{t("In .wslconfig in your Windows user folder, add networkingMode=mirrored under [wsl2]")}</li>
          <li>
            {t("Run wsl --shutdown in PowerShell (everything in WSL stops, AI sessions too), then start WSL again")}
          </li>
          <li>
            {t("In PowerShell as administrator, let the port in through the Hyper-V firewall:")}
            <code className={styles.command}>{rule}</code>
          </li>
        </ol>
      </details>
    </div>
  )
}

// ホスト名の項目のビュー: 空なら OS のホスト名を薄く出す
export function HostNameSetting(props: UserSettingControlProps<string>) {
  const status = useHostStatus()
  return <TextSettingControl {...props} placeholder={status?.osHostName} />
}
