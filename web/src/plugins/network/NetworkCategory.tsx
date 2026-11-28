// 設定カテゴリ「ネットワーク」: ホスト名とほかのホストとつなぐかの項目。つなぐが入なら、待ち受けアドレス（番地ごとに［コピー］）とこのホストの鍵の印か、
// 入口を開けなかった理由の 1 行（覚えたポートが使われていれば［別のポートにする］。確かめのダイアログを開く）。その下に、AI 用ホストリストに載せるこのホストのワークルーム
// （全部か 5 件。つなぐが切でも出す）。そのうえ NAT の WSL では WSLプロキシの稼働中・非稼働の札（「？」に訳。立たなかった・止まったら［立て直す］、Windows でポートが使われていれば［別のポートにする］）。
// 稼働中は、待ち受けアドレスに WSLプロキシの番地（Windows の LAN の番地）を出す。WSL で WSLプロキシが稼働していないときは、
// このホストから相手の待ち受けアドレスを入れてつなぐ案内と、開くと出る、相手からも見つけられるようにする手引き。
// Windows で直に動くときは、つなぐの下にファイアウォールの［許可する｜許可しない］（許可している間だけ入口を開き、待ち受けアドレスを出す）
import { useEffect, useState } from "react"
import { type LISTED_WORKROOMS, NOT_SET } from "../../plugin-api"
import { type UserSettingControlProps, useActions, useMessages, useSettings } from "../../plugin-api/ui"
import {
  ActionButton,
  Choices,
  ChoiceText,
  HelpButton,
  type HostEntrance,
  NO_FIREWALL,
  NO_HOST_STATUS,
  NO_PORT,
  NO_WSL_PROXY,
  SettingRow,
  Switch,
  TextAround,
  TextSettingControl,
  UserSettings,
  useAskHosts,
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
  const [firewallAsking, setFirewallAsking] = useState<FirewallAsking>("none")
  if (!on || got === NO_HOST_STATUS)
    return <UserSettings settings={[HOST_NAME.id, CONNECT_HOSTS.id, LISTED_WORKROOMS_SETTING.id]} />
  const status = got
  const proxied = status.wslProxy === "running" && status.wslProxyAddrs.length > 0
  const addrs = proxied ? status.wslProxyAddrs : status.addrs
  return (
    <>
      <UserSettings settings={[HOST_NAME.id, CONNECT_HOSTS.id]} />
      <FirewallSetting status={status} asking={firewallAsking} setAsking={setFirewallAsking} />
      {status.open && firewallAsking !== "deny" && (
        <div className={styles.rows}>
          <SettingRow label={t("Listening at")}>
            <span className={styles.addrs}>
              {addrs.map(a => (
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
      <WslProxyNote status={status} />
      {status.wsl && status.port !== NO_PORT && status.wslProxy !== "running" && <WslGuide port={status.port} />}
    </>
  )
}

// ファイアウォールの行: ［許可する｜許可しない］と、公衆 LAN での許可を勧めない赤い行。許可しようとしてつなげなければ、理由を分けずに 1 行。
// 押すと UAC が出て、答えるまで切り替えを押せない（押した側を見せておく）。効かない様子は「許可しない」の側に置き、押せば試し直す
// 取り消しを頼んでいる間は、待ち受けアドレスを出さない（もう受けないので、コピーさせない）
type FirewallAsking = "allow" | "deny" | "none"

function FirewallSetting({
  status,
  asking,
  setAsking,
}: {
  status: HostEntrance
  asking: FirewallAsking
  setAsking: (a: FirewallAsking) => void
}) {
  const t = useMessages(kit)
  const ask = useAskHosts()
  const [failed, setFailed] = useState(false)
  if (status.firewall === NO_FIREWALL) return null
  const value = asking !== "none" ? asking : status.firewall === "allowed" ? "allow" : "deny"
  const set = (v: "allow" | "deny") => {
    setAsking(v)
    setFailed(false)
    void ask({ kind: "firewall", allow: v === "allow" })
      .catch(() => setFailed(true))
      .finally(() => setAsking("none"))
  }
  const busy = asking !== "none"
  return (
    <div className={styles.rows}>
      <SettingRow label={t("Firewall setting")} help={t("To talk with matomezu in the LAN, allow it")}>
        <span className={styles.firewall}>
          <TextAround text={t("{choice} matomezu")} part="choice">
            <Choices
              label={t("Firewall setting")}
              value={value}
              options={[
                {
                  value: "allow" as const,
                  label: t("Allow matomezu"),
                  icon: <ChoiceText>{t("Allow")}</ChoiceText>,
                  disabled: busy,
                },
                {
                  value: "deny" as const,
                  label: t("Do not allow matomezu"),
                  icon: <ChoiceText>{t("Do not allow")}</ChoiceText>,
                  disabled: busy,
                },
              ]}
              onChange={set}
            />
          </TextAround>
          {busy ? <Waiting label={t("Waiting for Windows")} /> : null}
        </span>
      </SettingRow>
      <p className={styles.danger}>{t("Allowing on a public LAN is not recommended")}</p>
      {status.firewall === "ineffective" && !busy && (
        <p className={styles.danger}>{t("The allowance cannot take effect. Ask the person in charge")}</p>
      )}
      {failed && <p className={styles.danger}>{t("Could not ask the server")}</p>}
    </div>
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

// ［立て直す］を出す WSLプロキシの様子（立たなかった・止まった。Windows の側を直したあとで試せるように）
const RESTARTABLE: ReadonlySet<string> = new Set(["stopped", "unavailable", "update-windows", "update-this", "listen"])

// WSLプロキシの札: 稼働中か非稼働かと、「？」に今の様子の訳。立たなかった・止まったら［立て直す］、Windows でポートが使われていれば［別のポートにする］
function WslProxyNote({ status }: { status: HostEntrance }) {
  const t = useMessages(kit)
  const ask = useAskHosts()
  const { openDialog } = useActions()
  const [failed, setFailed] = useState(false)
  if (status.wslProxy === NO_WSL_PROXY) return null
  const label = t(status.wslProxy === "running" ? "WSL proxy running" : "WSL proxy not running")
  const port = status.port === NO_PORT ? "" : status.port
  const why = {
    running: t("Windows forwards the access to WSL"),
    starting: t("Starting the WSL proxy on Windows"),
    unavailable: t("Install matomezu on Windows for the WSL proxy"),
    "update-windows": t("Match the versions of matomezu for the WSL proxy"),
    "update-this": t("Match the versions of matomezu for the WSL proxy"),
    "port-in-use": t("Port {port} is used on Windows", { port }),
    listen: t("The WSL proxy could not listen on Windows"),
    stopped: t("The WSL proxy on Windows stopped"),
  }[status.wslProxy]
  return (
    <p className={`${styles.note} ${styles.proxy}`}>
      {label}
      <HelpButton text={why} label={label} />
      {status.wslProxy === "port-in-use" && (
        <ActionButton onClick={() => openDialog(PORT_REPICK_DIALOG.id)}>{t("Use another port")}</ActionButton>
      )}
      {RESTARTABLE.has(status.wslProxy) && (
        <ActionButton onClick={() => void ask({ kind: "restart-wsl-proxy" }).catch(() => setFailed(true))}>
          {t("Start the WSL proxy again")}
        </ActionButton>
      )}
      {failed && <span>{t("Could not ask the server")}</span>}
    </p>
  )
}

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

// 常駐の応えを待つ間に回る印
function Waiting({ label }: { label: string }) {
  return <span className={styles.spinner} role="status" aria-label={label} />
}

// 「ほかのホストとつなぐ」の項目のビュー: 入口が設定に合わせ終えるまで（Windows では規則を読み終えるまで）、切り替えの横に回る印を出す
export function ConnectHostsSetting({ label, value, onChange }: UserSettingControlProps<boolean>) {
  const t = useMessages(kit)
  const status = useHostStatus()
  const on = value === true
  const waiting = status !== NO_HOST_STATUS && status.connect !== on
  return (
    <SettingRow label={label}>
      <span className={styles.firewall}>
        <Switch label={label} checked={on} onChange={onChange} />
        {waiting ? <Waiting label={t("Waiting for the server")} /> : null}
      </span>
    </SettingRow>
  )
}

// ホスト名の項目のビュー: 空なら OS のホスト名を薄く出す
export function HostNameSetting(props: UserSettingControlProps<string>) {
  const status = useHostStatus()
  return <TextSettingControl {...props} placeholder={status !== NO_HOST_STATUS ? status.osHostName : undefined} />
}
