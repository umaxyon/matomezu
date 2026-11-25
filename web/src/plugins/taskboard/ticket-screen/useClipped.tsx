// 1 行で … で切っている字の要素が、切れているか（中の字が要素の幅に収まらないか）。要素の大きさが変わったときと、字・開け閉めが変わったときに測り直す。
// 小数の幅で揺れないよう、1px までのはみ出しは切れていないとみなす。開いて折り返している間は切れていないと答えるので、見せる側は開いているかと合わせて使う
import { type RefObject, useEffectEvent, useLayoutEffect, useState } from "react"
import { useResize } from "../../base/ui"

export function useClipped(ref: RefObject<HTMLElement | null>, text: string, open: boolean): boolean {
  const [clipped, setClipped] = useState(false)
  const measure = useEffectEvent(() => {
    const el = ref.current
    if (el) setClipped(el.scrollWidth > el.clientWidth + 1)
  })
  useResize(ref, () => measure())
  // biome-ignore lint/correctness/useExhaustiveDependencies: 字と開け閉めが変わったら測り直す（大きさが変わらず useResize が知らせないことがある）
  useLayoutEffect(() => measure(), [text, open])
  return clipped
}
