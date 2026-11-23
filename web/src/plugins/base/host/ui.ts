// ホストどうしの入口の見た目の部品: 入口の様子のフック
import type { HostStatus } from "../../../store/state"
import { useMatomezuState } from "../../../ui/store-context"

// ホストどうしの入口の様子がまだ届いていないときの値（useHostStatus）
export const NO_HOST_STATUS = "none"
// ホストどうしの入口の様子（常駐が持つ物。まだ届いていなければ NO_HOST_STATUS）
export const useHostStatus = (): HostStatus | typeof NO_HOST_STATUS =>
  useMatomezuState(s => s.hostStatus ?? NO_HOST_STATUS)
