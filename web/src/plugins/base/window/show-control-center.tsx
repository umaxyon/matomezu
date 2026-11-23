// コントロールセンターをカレントスクリーンにする関数を返すフック（チケットの画面の巣箱など、コントロールセンターへ一発で戻るボタンが使う）。
// コントロールセンターのスクリーンをカレントスクリーンにする（開いていなければ何もしない）。ほかのスクリーンを名指すので、名指すのは base が受け持つ

import { useCallback } from "react"
import { NO_CONTROL_CENTER } from "../../../core/def/action"
import { useControlCenter, useReadState, useStoreActions } from "../../../ui/store-context"

export function useShowControlCenter(): () => void {
  const def = useControlCenter()
  const read = useReadState()
  const { makeScreenCurrent } = useStoreActions()
  return useCallback(() => {
    if (def === NO_CONTROL_CENTER) return
    const center = read().window.screens.find(s => s.def === def)
    if (center) makeScreenCurrent(center.id)
  }, [def, read, makeScreenCurrent])
}
