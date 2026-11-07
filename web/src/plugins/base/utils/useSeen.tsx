// 物が見えているかを知らせるフック: ブックのタイプごとのビューが、ステージ stage で、ページの最上位のアイテムが見える所にあるかを答える関数 test を知らせる。
// 土台は、AI とほかの窓のまだ見ていない変更の物がどれか見えたら、その変更を画面の履歴に時刻の位置で差し込む（test には前と後のブックで聞き、消えた物は前の場所で答える）。
// 知らせないビューでは、開いているページの変更は見えたとする。test は描き直しのたびに作り直さない（今のずらす量や倍率は、呼ばれたときに読む）。
// 開いている物・ずらす量・倍率が変わるたびに、土台が聞き直す
import { useEffect } from "react"
import type { SeenTest } from "../../../core/history"
import { useInstance } from "../../../ui/store-context"

export function useSeen(stage: string, test: SeenTest): void {
  const { setSeenTest } = useInstance()
  useEffect(() => {
    setSeenTest(stage, test)
    return () => setSeenTest(stage, null)
  }, [setSeenTest, stage, test])
}
