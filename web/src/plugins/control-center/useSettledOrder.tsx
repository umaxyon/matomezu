// 列の並びを、行が途中の様子に入った直後は前の並びで待つ（決めるのは rows.ts の settleOrder）。ここは覚えを持ち、待ち終わりに描き直すだけ
import { useEffect, useRef, useState } from "react"
import type { WorkroomRow } from "../base"
import { type Settling, settleOrder } from "./rows"

export function useSettledOrder(ordered: readonly WorkroomRow[]): WorkroomRow[] {
  const settling = useRef<Settling | undefined>(undefined)
  const { rows, next, wakeAt } = settleOrder(ordered, settling.current, Date.now())
  settling.current = next
  const [, wake] = useState(0)
  useEffect(() => {
    if (wakeAt === undefined) return
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, wakeAt - Date.now()))
    return () => clearTimeout(timer)
  }, [wakeAt])
  return rows
}
