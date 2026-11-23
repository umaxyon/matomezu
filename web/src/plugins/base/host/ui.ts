// ホストどうしの入口の見た目の部品: 入口の様子のフック
import { useMemo } from "react"
import type { HostStatus } from "../../../store/state"
import { useMatomezuState } from "../../../ui/store-context"

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
