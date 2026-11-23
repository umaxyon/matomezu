// 1 つの物に、クリックとダブルクリックで別の動きを持たせるフック。ダブルクリックの 1 回目のクリックで、クリックの動きを起こさない。
// ブラウザはダブルクリックと見なす間隔（OS の設定）を出さないので、1 回目のクリック（detail が 1）を CLICK_WAIT_MS だけ待ち、
// その間に 2 回目（detail が 2）が来ればダブルクリック、来なければクリックとする。3 回目より後は何もしない。キーで押した（detail が 0）ときは待たずにクリック
import type { MouseEvent } from "react"
import { useEffect, useRef } from "react"

export const CLICK_WAIT_MS = 250

// キーで押したときの、押した点 at の値（押した点が無い）
export const BY_KEY = "key"
// 押された物 el と、押した点 at（キーで押したなら BY_KEY）
export interface Clicked {
  el: HTMLElement
  at: { x: number; y: number } | typeof BY_KEY
}

export function useClickOrDouble(
  onClick: (c: Clicked) => void,
  onDouble: () => void,
): (e: MouseEvent<HTMLElement>) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ onClick, onDouble })
  latest.current = { onClick, onDouble }
  useEffect(() => () => clearTimeout(timer.current), [])
  return e => {
    clearTimeout(timer.current)
    timer.current = undefined
    if (e.detail > 2) return
    if (e.detail === 2) return latest.current.onDouble()
    const c: Clicked = { el: e.currentTarget, at: e.detail === 0 ? BY_KEY : { x: e.clientX, y: e.clientY } }
    if (e.detail === 0) return latest.current.onClick(c)
    timer.current = setTimeout(() => {
      timer.current = undefined
      latest.current.onClick(c)
    }, CLICK_WAIT_MS)
  }
}
