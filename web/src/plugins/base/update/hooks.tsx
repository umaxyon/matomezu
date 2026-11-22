// 版の更新のフック
import type { StaleBuild } from "../../../store/state"
import { useInstance, useMatomezuState } from "../../../ui/store-context"

// つなぎ直した常駐が、窓を開いたときと別の版か（同じなら null）
export const useStaleBuild = (): StaleBuild | null => useMatomezuState(s => s.staleBuild)

// 窓を読み込み直す（開いていたブックとページは URL に残る）
export const useReloadWindow = (): (() => void) => useInstance().reloadWindow
