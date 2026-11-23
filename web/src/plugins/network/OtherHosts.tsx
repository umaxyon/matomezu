// コントロールセンターの「ほかのホスト」の節（スロット below-participants に置く。「ホストとつなぐ」が入のときだけ）: 見出しの右に［＋］（ホストをつなぐのダイアログ）、
// ペアリングしたホストの行（● つながっている・○ つながっていない、ホスト名）。行を押すと、コントロールセンターの選んでいる物にし、右の下の枠に詳しい所が出る。
// 節を出したときに、ペアリングしたホストとつながっているかを常駐に確かめてもらう（間を置いて確かめ続けない）
import { useEffect } from "react"
import { NO_STATE } from "../../plugin-api"
import { useActions, useMessages, useRecords, useSetPluginStateById, useSettings } from "../../plugin-api/ui"
import {
  Band,
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
import { hostRows, shownName } from "./hosts"
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
            <button
              type="button"
              className={styles.pick}
              onClick={() => setById(PICKED_STATE, { kind: PAIRED_HOST.id, id: row.record.id })}
            >
              <span
                className={styles.dot}
                data-connected={row.live?.connected === true}
                role="img"
                aria-label={row.live?.connected ? t("Connected") : t("Not connected")}
              />
              <span className={styles.name}>{shownName(row, rows)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
