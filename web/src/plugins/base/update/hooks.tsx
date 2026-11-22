// 版の更新のフック
import type { StaleBuild, UpdateStatus } from "../../../store/state"
import { useInstance, useMatomezuState } from "../../../ui/store-context"

// つなぎ直した常駐が、窓を開いたときと別の版か（同じなら null）
export const useStaleBuild = (): StaleBuild | null => useMatomezuState(s => s.staleBuild)

// 窓を読み込み直す（開いていたブックとページは URL に残る）
export const useReloadWindow = (): (() => void) => useInstance().reloadWindow

// 新しい版の確かめの結果（常駐が持つ物。まだ届いていなければ null）
export const useUpdateStatus = (): UpdateStatus | null => useMatomezuState(s => s.updateStatus)

// 新しい版を今確かめるのをホストに頼む（結果は useUpdateStatus に入る）。頼めなければ投げる
export const useCheckUpdate = (): (() => Promise<void>) => useInstance().checkUpdate
