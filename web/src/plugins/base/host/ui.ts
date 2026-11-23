// ホストどうしの入口の見た目の部品: 入口の様子・ほかのホストの様子のフックと、ほかのホストについてホストに頼むフック
import type { HostPeers, HostRequest, HostStatus } from "../../../store/state"
import { useInstance, useMatomezuState } from "../../../ui/store-context"

// ホストどうしの入口の様子（常駐が持つ物。まだ届いていなければ null）
export const useHostStatus = (): HostStatus | null => useMatomezuState(s => s.hostStatus)

// ほかのホストの様子（常駐が持つ物。まだ届いていなければ null）
export const useHostPeers = (): HostPeers | null => useMatomezuState(s => s.hostPeers)

// ほかのホストについてホストに頼む（様子は useHostPeers に入る）
export const useAskHosts = (): ((request: HostRequest) => Promise<void>) => useInstance().askHosts
