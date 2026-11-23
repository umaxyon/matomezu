// ホストどうしの入口の見た目の部品: 入口の様子のフック
import type { HostStatus } from "../../../store/state"
import { useMatomezuState } from "../../../ui/store-context"

// ホストどうしの入口の様子（常駐が持つ物。まだ届いていなければ null）
export const useHostStatus = (): HostStatus | null => useMatomezuState(s => s.hostStatus)
