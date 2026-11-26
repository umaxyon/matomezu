// 設定カテゴリ「ネットワーク」: ホスト名とほかのホストとつなぐかの項目。つなぐが入なら、待っている所（番地ごとに［コピー］）とこのホストの鍵の印か、
// 入口を開けなかった理由の 1 行（覚えたポートが使われていれば［別のポートにする］。確かめのダイアログを開く）。その下に、AI 用ホストリストに載せるこのホストのワークルーム
// （全部か 5 件。つなぐが切でも出す）。そのうえ WSL で動いているときは、このホストから相手の待っている所を入れてつなぐ案内と、開くと出る、相手からも見つけられるようにする手引き
import { useEffect, useState } from "react"
import { type LISTED_WORKROOMS, NOT_SET } from "../../plugin-api"
import { type UserSettingControlProps, useActions, useMessages, useSettings } from "../../plugin-api/ui"
import {
  ActionButton,
  Choices,
  ChoiceText,
  NO_HOST_STATUS,
  NO_PORT,
  SettingRow,
  TextSettingControl,
  UserSettings,
  useCopyText,
  useHostStatus,
} from "../base/ui"
import { PORT_REPICK_DIALOG } from "./dialogs"
import { kit } from "./kit"
import styles from "./NetworkCategory.module.css"
import { CONNECT_HOSTS, HOST_NAME, LISTED_WORKROOMS_SETTING } from "./settings"

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

export function NetworkCategory() {
  const t = useMessages(kit)
  const got = useHostStatus()
  const { values } = useSettings()
  const on = values[CONNECT_HOSTS.id] === true
  const { openDialog } = useActions()
  if (!on || got === NO_HOST_STATUS)
    return <UserSettings settings={[HOST_NAME.id, CONNECT_HOSTS.id, LISTED_WORKROOMS_SETTING.id]} />
  const status = got
  return (
    <>
      <UserSettings settings={[HOST_NAME.id, CONNECT_HOSTS.id]} />
      {status.open && (
        <div className={styles.rows}>
          <SettingRow label={t("Listening at")}>
            <span className={styles.addrs}>
              {status.addrs.map(a => (
                <Address key={a} text={`${a}:${status.port}`} />
              ))}
            </span>
          </SettingRow>
          <SettingRow label={t("Host key")}>
            <code className={styles.key}>{shownHostKey(status.hostId)}</code>
          </SettingRow>
        </div>
      )}
      <UserSettings settings={[LISTED_WORKROOMS_SETTING.id]} />
      {status.failed === "port-in-use" && (
        <p className={`${styles.note} ${styles.taken}`}>
          {t("Port {port} is used by another program", { port: status.port === NO_PORT ? "" : status.port })}
          <ActionButton onClick={() => openDialog(PORT_REPICK_DIALOG.id)}>{t("Use another port")}</ActionButton>
        </p>
      )}
      {status.failed === "listen" && <p className={styles.note}>{t("Could not open the entrance for other hosts")}</p>}
      {status.wsl && status.port !== NO_PORT && <WslGuide port={status.port} />}
    </>
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

// WSL の案内: NAT の WSL は mDNS で見つからず、相手から届かない。このホストからつなげば、リバース接続で相手の頼みも届く。
// 相手からも見つけてつなげるようにするには、WSL のネットワークをミラーにし、Hyper-V のファイアウォールにポートを通す（matomezu は自動では設定しない。
// 効かせるのに WSL の起動し直しが要り、AI のセッションごと止まるため）
function WslGuide({ port }: { port: number }) {
  const t = useMessages(kit)
  const rule = `New-NetFirewallHyperVRule -Name matomezu -DisplayName matomezu -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts ${port}`
  return (
    <div className={styles.note}>
      <p>{t("On WSL, other machines cannot find this host")}</p>
      <p>{t("Pair from this host by typing where the other host listens, and both can use it")}</p>
      <details>
        <summary>{t("To let other machines find this host too")}</summary>
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

// AI 用ホストリストに載せるこのホストのワークルームの項目のビュー: ［全部｜5 件］（既定の全部を選べば値を消す）
export function ListedWorkroomsSetting({
  label,
  value,
  onChange,
  onReset,
}: UserSettingControlProps<(typeof LISTED_WORKROOMS)[number]>) {
  const t = useMessages(kit)
  return (
    <SettingRow label={label}>
      <Choices
        label={label}
        value={value === NOT_SET ? "all" : value}
        options={[
          { value: "all" as const, label: t("All the workrooms"), icon: <ChoiceText>{t("All workrooms")}</ChoiceText> },
          {
            value: "recent" as const,
            label: t("The 5 workrooms that changed last"),
            icon: <ChoiceText>{t("5 recent workrooms")}</ChoiceText>,
          },
        ]}
        onChange={v => (v === "all" ? onReset() : onChange(v))}
      />
    </SettingRow>
  )
}

// ホスト名の項目のビュー: 空なら OS のホスト名を薄く出す
export function HostNameSetting(props: UserSettingControlProps<string>) {
  const status = useHostStatus()
  return <TextSettingControl {...props} placeholder={status !== NO_HOST_STATUS ? status.osHostName : undefined} />
}
