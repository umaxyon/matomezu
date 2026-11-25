// コントロールセンターの「ほかのホスト」の節（スロット below-participants に置く。「ホストとつなぐ」が入のときだけ）: 見出しの右に［＋］（ホストをつなぐのダイアログ）、
// ペアリングしたホストの行（▸ 開く、● つながっている・○ つながっていない、ホストエイリアス、AI 用ホストリストから隠したホストは右に薄い斜線の入った目）。名前を押すと、コントロールセンターの選んでいる物にし、右の下の枠に詳しい所が出る。
// ▸ を押すと行を開き、相手のワークルームの行（名前と作業中・空き。常駐が持つ相手の一覧の写しから。見るだけ）を出す。つながっていなければ「つながっていません」だけ。
// 節を出したときに、ペアリングしたホストとつながっているかを常駐に確かめてもらう（間を置いて確かめ続けない）
import { useEffect, useState } from "react"
import { NO_STATE } from "../../plugin-api"
import { useActions, useMessages, useRecords, useSetPluginStateById, useSettings } from "../../plugin-api/ui"
import {
  Band,
  ChevronIcon,
  type HostPeers,
  IconButton,
  LineIcon,
  NO_HOST_PEERS,
  NOT_TOLD,
  Panel,
  type PeerLive,
  useAskHosts,
  useHostPeers,
} from "../base/ui"
import { PICKED_STATE } from "./control-center-ids"
import { PAIRING_DIALOG } from "./dialogs"
import { hostRows } from "./hosts"
import { EyeHiddenIcon } from "./icons"
import { kit } from "./kit"
import styles from "./OtherHosts.module.css"
import { PAIRED_HOST } from "./pairing"
import { CONNECT_HOSTS } from "./settings"

// ペアリングしたホストの様子（まだ届いていなければ空）
export const pairedOf = (peers: HostPeers | typeof NO_HOST_PEERS): readonly PeerLive[] =>
  peers === NO_HOST_PEERS ? [] : peers.paired

export function OtherHosts({ picked }: { picked: { kind: string; id: string } | typeof NO_STATE }) {
  const on = useSettings().values[CONNECT_HOSTS.id] === true
  return on ? <Section picked={picked} /> : null
}

function Section({ picked }: { picked: { kind: string; id: string } | typeof NO_STATE }) {
  const t = useMessages(kit)
  const ask = useAskHosts()
  const { openDialog } = useActions()
  const setById = useSetPluginStateById()
  const records = useRecords(PAIRED_HOST.id, { where: [] })
  const rows = hostRows(records, pairedOf(useHostPeers()), NOT_TOLD)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setOpened(now => {
      const next = new Set(now)
      if (!next.delete(id)) next.add(id)
      return next
    })
  useEffect(() => {
    void ask({ kind: "check" }).catch(() => {})
  }, [ask])
  return (
    <Panel className={styles.section}>
      <Band spread>
        <h2 className={styles.heading}>{t("Other hosts")}</h2>
        <IconButton small label={t("Pair with a host")} onClick={() => openDialog(PAIRING_DIALOG.id)}>
          <LineIcon size={12} stroke={2}>
            <path d="M12 5v14M5 12h14" />
          </LineIcon>
        </IconButton>
      </Band>
      {rows.length === 0 ? <p className={styles.note}>{t("No paired hosts")}</p> : null}
      <ul className={styles.rows}>
        {rows.map(row => (
          <li
            key={row.record.id}
            className={styles.row}
            data-selected={picked !== NO_STATE && picked.kind === PAIRED_HOST.id && picked.id === row.record.id}
            data-paired-host={row.record.hostId}
          >
            <div className={styles.line}>
              <button
                type="button"
                className={styles.open}
                aria-expanded={opened.has(row.record.id)}
                aria-label={t("Workrooms of {name}", { name: row.label })}
                onClick={() => toggle(row.record.id)}
              >
                <ChevronIcon size={12} />
              </button>
              <button
                type="button"
                className={styles.pick}
                onClick={() => setById(PICKED_STATE, { kind: PAIRED_HOST.id, id: row.record.id })}
              >
                <span
                  className={styles.dot}
                  data-connected={row.live?.state === "connected"}
                  role="img"
                  aria-label={row.live?.state === "connected" ? t("Connected") : t("Not connected")}
                />
                <span className={styles.name}>{row.label}</span>
                {row.record.listed === "hidden" ? (
                  <span className={styles.hidden} role="img" aria-label={t("Hidden from the host list for AIs")}>
                    <EyeHiddenIcon size={12} />
                  </span>
                ) : null}
              </button>
            </div>
            {opened.has(row.record.id) ? <Workrooms live={row.live} /> : null}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// 開いたホストの行の下: 相手のワークルームの行（見るだけ）。そこにいる AI が生きていなければ、行を薄くして「応答なし」を添える。つながっていなければ「つながっていません」だけ
function Workrooms({ live }: { live: PeerLive | undefined }) {
  const t = useMessages(kit)
  if (live?.state !== "connected") return <p className={styles.rooms}>{t("Not connected now")}</p>
  if (live.workrooms.length === 0) return <p className={styles.rooms}>{t("No AI is in a workroom")}</p>
  return (
    <ul className={styles.rooms} aria-label={t("Workrooms of {name}", { name: live.label })}>
      {live.workrooms.map(w => (
        <li key={w.name} className={styles.room} data-lapsed={w.alive === "lapsed"}>
          <span className={styles.roomName}>{w.name}</span>
          {w.activity === "unknown" && w.alive !== "lapsed" ? null : (
            <span className={styles.activity}>
              {[
                ...(w.activity === "unknown" ? [] : [w.activity === "working" ? t("Working") : t("Idle")]),
                ...(w.alive === "lapsed" ? [t("Not responding")] : []),
              ].join(" · ")}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
