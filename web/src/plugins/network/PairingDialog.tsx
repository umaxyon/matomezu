// ホストをつなぐ（このホストからペアリングを頼む）: 頼んでいる様子（常駐が持つ。読み直しても［＋］で開けば今の様子から出す）で見え方が決まる。
// 頼んでいなければ、見つかったホスト（mDNS。開いたときに問い直す。見つかった分から足される）から 1 つ選ぶか、待っている所を手で入れて［つなぐ］。
// 待っている間は、相手のホスト名と接続確認コードと［やめる］。受け入れられたらダイアログを閉じ、そのホストの行を選ぶ。うまくいかなければ理由の 1 行と［やり直す］。
// × と Esc は［やめる］と同じ（頼みを取り下げる。閉じたあとの頼みを見る所が無いため）。どの閉じ方でも、終わった様子を常駐から消す
import { type FormEvent, useEffect, useId, useState } from "react"
import { type DialogProps, useMessages, useRecords, useSetPluginStateById } from "../../plugin-api/ui"
import { ActionButton, Dialog, type FoundHost, type HostPairing, useAskHosts, useHostPeers } from "../base/ui"
import { CONTROL_CENTER_SCREEN, PICKED_STATE } from "./control-center-ids"
import { ipOf } from "./hosts"
import { kit } from "./kit"
import styles from "./Pairing.module.css"
import { PAIRED_HOST } from "./pairing"

export function PairingDialog({ onClose }: DialogProps) {
  const t = useMessages(kit)
  const pairing = useHostPeers()?.pairing
  const ask = useAskHosts()
  // どの閉じ方でも（×・Esc・外側・受け入れられたあと）、頼みを取り下げ、終わった様子を消す（Esc はキーバインドが閉じるので、ダイアログが消えるときに頼む）。頼んでいないときも送る（常駐は何もしない）。［つなぐ］の様子が届く前に閉じても漏らさないため
  useEffect(
    () => () => {
      void ask({ kind: "end-pairing" }).catch(() => {})
    },
    [ask],
  )
  return (
    <Dialog title={t("Pair with a host")} width={480} onClose={onClose}>
      {pairing ? <Asked pairing={pairing} onClose={onClose} /> : <Choose onCancel={onClose} />}
    </Dialog>
  )
}

// 頼む相手を選ぶ
function Choose({ onCancel }: { onCancel: () => void }) {
  const t = useMessages(kit)
  const ask = useAskHosts()
  const found = useHostPeers()?.found ?? []
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const [manual, setManual] = useState("")
  const [typing, setTyping] = useState(false)
  const [failed, setFailed] = useState(false)
  const formId = useId()
  useEffect(() => {
    void ask({ kind: "discover" }).catch(() => {})
  }, [ask])
  const addr = typing ? manual.trim() : found.find(f => f.hostId === chosen)?.addr
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!addr) return
    setFailed(false)
    void ask({ kind: "pair", addr, manual: typing }).catch(() => setFailed(true))
  }
  return (
    <form id={formId} onSubmit={submit}>
      <div className={styles.head}>
        <span>{t("Found hosts")}</span>
        <span className={styles.muted}>{t("Searching")}</span>
      </div>
      <ul className={styles.found}>
        {found.map(f => (
          <FoundRow
            key={f.hostId}
            host={f}
            checked={!typing && chosen === f.hostId}
            onPick={() => {
              setTyping(false)
              setChosen(f.hostId)
            }}
          />
        ))}
      </ul>
      <p className={styles.muted}>{t("Paired hosts and this host are not listed")}</p>
      <details className={styles.manual} open={typing} onToggle={e => setTyping(e.currentTarget.open)}>
        <summary>{t("If the host is not listed, type where it listens")}</summary>
        <input
          className={styles.addr}
          aria-label={t("Listening at")}
          placeholder="192.168.11.20:7240"
          value={manual}
          onChange={e => setManual(e.target.value)}
        />
      </details>
      {failed ? <p className={styles.failed}>{t("Could not ask the server")}</p> : null}
      <div className={styles.buttons}>
        <ActionButton onClick={onCancel}>{t("Cancel pairing")}</ActionButton>
        <ActionButton primary form={formId} disabled={!addr}>
          {t("Pair")}
        </ActionButton>
      </div>
    </form>
  )
}

function FoundRow({ host, checked, onPick }: { host: FoundHost; checked: boolean; onPick: () => void }) {
  const t = useMessages(kit)
  const ip = ipOf(host.addr)
  return (
    <li>
      <label className={styles.foundRow}>
        <input type="radio" name="host" checked={checked} onChange={onPick} />
        <span className={styles.name}>{host.name}</span>
        {host.userName ? <span className={styles.muted}>{t("({name})", { name: host.userName })}</span> : null}
        <span className={styles.ip}>{ip}</span>
      </label>
    </li>
  )
}

// 頼んだあと: 待っている・結果
function Asked({ pairing, onClose }: { pairing: HostPairing; onClose: () => void }) {
  const t = useMessages(kit)
  const ask = useAskHosts()
  const setById = useSetPluginStateById()
  const paired = useRecords(PAIRED_HOST.id, { where: [] }).find(r => r.hostId === pairing.hostId)
  const accepted = pairing.phase === "accepted" && paired !== undefined
  useEffect(() => {
    if (!accepted || !paired) return
    // ダイアログはスクリーンの外に描くので、コントロールセンターのスクリーンを名指す
    setById(PICKED_STATE, { kind: PAIRED_HOST.id, id: paired.id }, { screenDef: CONTROL_CENTER_SCREEN })
    onClose()
  }, [accepted, paired, setById, onClose])
  const name = pairing.name || pairing.addr
  if (pairing.phase === "asking" || pairing.phase === "waiting" || pairing.phase === "accepted")
    return (
      <>
        <p>{pairing.name ? t("Waiting for {name} to accept", { name }) : t("Asking {name}", { name })}</p>
        {pairing.code ? <Code code={pairing.code} /> : null}
        <div className={styles.buttons}>
          <ActionButton onClick={onClose}>{t("Cancel pairing")}</ActionButton>
        </div>
      </>
    )
  return (
    <>
      <p className={styles.failed}>{t(failureText(pairing), { name })}</p>
      <div className={styles.buttons}>
        <ActionButton onClick={onClose}>{t("Close")}</ActionButton>
        <ActionButton primary onClick={() => void ask({ kind: "end-pairing" }).catch(() => {})}>
          {t("Try again")}
        </ActionButton>
      </div>
    </>
  )
}

// うまくいかなかったときの 1 行
export function failureText(p: HostPairing) {
  switch (p.phase) {
    case "declined":
      return "{name} declined"
    case "timed-out":
      return "Time ran out before it was accepted"
    case "key-mismatch":
      return "The key of {name} changed on the way. Try again"
    case "refused":
      return p.reason === "self"
        ? "This is this host itself"
        : p.reason === "busy"
          ? "{name} is answering other requests. Wait a little and try again"
          : p.reason === "protocol"
            ? "The version of matomezu on {name} does not match"
            : "{name} did not take the request"
    default:
      return "Could not reach the host"
  }
}

// 接続確認コード（3 桁ずつ）と、相手の画面と見比べる一言
export function Code({ code }: { code: string }) {
  const t = useMessages(kit)
  return (
    <div className={styles.code}>
      <span className={styles.muted}>{t("Connection check code")}</span>
      <span className={styles.digits}>{`${code.slice(0, 3)} ${code.slice(3)}`}</span>
      <span className={styles.muted}>{t("Check that the other screen shows the same")}</span>
    </div>
  )
}
