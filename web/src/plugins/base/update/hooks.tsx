// 版の更新のフック
import { useMemo } from "react"
import type { StaleBuild, UpdateStatus } from "../../../store/state"
import { useInstance, useMatomezuState } from "../../../ui/store-context"

// つなぎ直した常駐が、窓を開いたときと別の版か（同じなら null）
export const useStaleBuild = (): StaleBuild | null => useMatomezuState(s => s.staleBuild)

// 窓を読み込み直す（開いていたブックとページは URL に残る）
export const useReloadWindow = (): (() => void) => useInstance().reloadWindow

// 新しい版の確かめの結果がまだ届いていないときの値（useUpdateStatus）
export const NO_UPDATE_STATUS = "none"
// 新しい版をまだ知らないときの値
export const NO_LATEST = "none"
// まだ確かめていないときの値
export const NOT_CHECKED = "none"
// まだ AI に版を上げるよう頼んでいないときの値
export const NOT_ASKED = "none"

// プラグインに渡す、新しい版の確かめの結果（ホストが渡す UpdateStatus の、無い物を名前の付いた値にした物）。
// latest は新しい版、checkedAt は確かめた時、askedAt は AI に版を上げるよう頼んだ時
export interface UpdateCheck {
  state: UpdateStatus["state"]
  version: string
  latest: string | typeof NO_LATEST
  checkedAt: string | typeof NOT_CHECKED
  askedAt: string | typeof NOT_ASKED
}

// ホストが渡す確かめの結果 s の、プラグインに渡す形
const checkOf = (s: UpdateStatus): UpdateCheck => ({
  state: s.state,
  version: s.version,
  latest: s.latest ?? NO_LATEST,
  checkedAt: s.checkedAt ?? NOT_CHECKED,
  askedAt: s.askedAt ?? NOT_ASKED,
})

// 新しい版の確かめの結果（常駐が持つ物。まだ届いていなければ NO_UPDATE_STATUS）
export const useUpdateStatus = (): UpdateCheck | typeof NO_UPDATE_STATUS => {
  const status = useMatomezuState(s => s.updateStatus)
  return useMemo(() => (status ? checkOf(status) : NO_UPDATE_STATUS), [status])
}

// 新しい版を今確かめるのをホストに頼む（結果は useUpdateStatus に入る）。頼めなければ投げる
export const useCheckUpdate = (): (() => Promise<void>) => useInstance().checkUpdate

// ワークルーム（id）の AI に、版を上げるよう頼む（そこに AI がいなければ false）。頼めなければ投げる
export const useAskUpdate = (): ((workroom: string) => Promise<boolean>) => useInstance().askUpdate
