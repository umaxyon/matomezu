// ホストどうしの入口の見た目の部品: 入口の様子・ほかのホストの様子のフックと、ほかのホストについてホストに頼むフック
import { useMemo } from "react"
import type {
  FoundHost as GivenFound,
  HostPairing as GivenPairing,
  HostPeers as GivenPeers,
  HostRequest,
  HostStatus,
} from "../../../store/state"
import { useInstance, useMatomezuState } from "../../../ui/store-context"

export type { HostRequest } from "../../../store/state"

// ホストどうしの入口の様子がまだ届いていないときの値（useHostStatus）
export const NO_HOST_STATUS = "none"
// 入口のポートがまだ決まっていないときの値
export const NO_PORT = "none"
// 入口を開こうとして、開けなかったことが無いときの値
export const NOT_FAILED = "none"

// プラグインに渡す、ホストどうしの入口の様子（ホストが渡す HostStatus の、無い物を名前の付いた値にした物。
// 待っている所の番地 addrs は無ければ空、wsl は WSL で動いていなければ false）
export interface HostEntrance {
  hostId: string
  name: string
  osHostName: string
  open: boolean
  port: number | typeof NO_PORT
  addrs: readonly string[]
  wsl: boolean
  failed: NonNullable<HostStatus["failed"]> | typeof NOT_FAILED
}

// ホストが渡す入口の様子 s の、プラグインに渡す形
const entranceOf = (s: HostStatus): HostEntrance => ({
  hostId: s.hostId,
  name: s.name,
  osHostName: s.osHostName,
  open: s.open,
  port: s.port ?? NO_PORT,
  addrs: s.addrs ?? [],
  wsl: s.wsl === true,
  failed: s.failed ?? NOT_FAILED,
})

// ホストどうしの入口の様子（常駐が持つ物。まだ届いていなければ NO_HOST_STATUS）
export const useHostStatus = (): HostEntrance | typeof NO_HOST_STATUS => {
  const status = useMatomezuState(s => s.hostStatus)
  return useMemo(() => (status ? entranceOf(status) : NO_HOST_STATUS), [status])
}

// ほかのホストの様子がまだ届いていないときの値（useHostPeers）
export const NO_HOST_PEERS = "none"
// ペアリングを頼んでいないときの値（HostPeers の pairing）
export const NO_PAIRING = "none"
// 常駐がまだ知らない・相手が名乗っていない文字列の値（名前・番地・時刻・接続確認コードなど）
export const NOT_TOLD: unique symbol = Symbol("not told")

// ほかのホストのワークルーム 1 つ（相手の一覧の写し）: 名前と作業の様子（作業中・空き。答える種類が相手に無ければ unknown）
export interface PeerWorkroom {
  name: string
  activity: "working" | "idle" | "unknown"
}

// プラグインに渡す、ペアリングしたホスト 1 つの様子（常駐だけが持つ物）
export interface PeerLive {
  hostId: string
  label: string // ホストエイリアス（常駐が決める。届く行と AI の send_message の host と同じ）
  connected: boolean
  workrooms: readonly PeerWorkroom[] // 相手のワークルームの一覧の写し（つながっていなければ空）
  keyMismatch: boolean // 覚えた鍵と合わない相手が答えた
  lastSeen: string | typeof NOT_TOLD // 最後につながった時刻
  addr: string | typeof NOT_TOLD // 確かめた待っている所（番地:ポート）
  name: string | typeof NOT_TOLD // 今のホスト名
  userName: string | typeof NOT_TOLD
}

// プラグインに渡す、このホストから頼んでいるペアリングの様子
export interface HostPairing {
  phase: GivenPairing["phase"]
  addr: string
  hostId: string | typeof NOT_TOLD
  name: string | typeof NOT_TOLD
  userName: string | typeof NOT_TOLD
  code: string | typeof NOT_TOLD // 接続確認コード
  reason: string | typeof NOT_TOLD // refused のわけ（self・busy・protocol など）
}

// プラグインに渡す、同じネットワークで見つけたホスト 1 つ（相手が名乗っていない名前は NOT_TOLD）
export interface FoundHost {
  hostId: string
  name: string | typeof NOT_TOLD
  userName: string | typeof NOT_TOLD
  addr: string
}

// プラグインに渡す、ほかのホストの様子
export interface HostPeers {
  paired: readonly PeerLive[]
  found: readonly FoundHost[]
  pairing: HostPairing | typeof NO_PAIRING
}

const told = (s: string | undefined): string | typeof NOT_TOLD => (s === undefined || s === "" ? NOT_TOLD : s)

// ホストが渡すほかのホストの様子 p の、プラグインに渡す形
const peersOf = (p: GivenPeers): HostPeers => ({
  paired: p.paired.map(l => ({
    hostId: l.hostId,
    label: l.label,
    connected: l.connected,
    workrooms: l.workrooms ?? [],
    keyMismatch: l.keyMismatch === true,
    lastSeen: told(l.lastSeen),
    addr: told(l.addr),
    name: told(l.name),
    userName: told(l.userName),
  })),
  found: p.found.map((f: GivenFound) => ({ ...f, name: told(f.name), userName: told(f.userName) })),
  pairing: p.pairing
    ? {
        phase: p.pairing.phase,
        addr: p.pairing.addr,
        hostId: told(p.pairing.hostId),
        name: told(p.pairing.name),
        userName: told(p.pairing.userName),
        code: told(p.pairing.code),
        reason: told(p.pairing.reason),
      }
    : NO_PAIRING,
})

// ほかのホストの様子（常駐が持つ物。まだ届いていなければ NO_HOST_PEERS）
export const useHostPeers = (): HostPeers | typeof NO_HOST_PEERS => {
  const peers = useMatomezuState(s => s.hostPeers)
  return useMemo(() => (peers ? peersOf(peers) : NO_HOST_PEERS), [peers])
}

// ほかのホストについてホストに頼む（様子は useHostPeers に入る）
export const useAskHosts = (): ((request: HostRequest) => Promise<void>) => useInstance().askHosts
