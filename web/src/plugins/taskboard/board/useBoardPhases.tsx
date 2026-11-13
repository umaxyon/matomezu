// タスクボードの出入りの様子（boardPhases.ts）を、時間で進めるフック: 新しく出すタスクボードは、畳んで 1 回描いてから idle にし、出さなくなるタスクボードは、右へ出て枠が閉じるのを待ってから取り除く。
// 出しているタスクボード shown が変わった（この窓のチェックでも、別の窓の変更でも）ときに動く。最初の描画では動かさない。
// 出ていくタスクボードの id は onLeaving で知らせる（最大化を解くなど）
import { useEffect, useRef, useState } from "react"
import { ENTER_FRAME_MS, LEAVE_REMOVE_MS } from "../motion"
import { nextPhases, type Phase, type Phases } from "./boardPhases"

export function useBoardPhases(shown: readonly string[], onLeaving: (id: string) => void): Phases {
  const [phases, setPhases] = useState<Phases>(() => nextPhases({}, shown, true))
  const before = useRef(shown)
  const leaving = useRef(onLeaving)
  leaving.current = onLeaving
  const timers = useRef<number[]>([])
  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer)
    },
    [],
  )
  const key = shown.join("\n")
  // biome-ignore lint/correctness/useExhaustiveDependencies: 出しているタスクボードの並びが変わったときだけ（key が並びを表す）
  useEffect(() => {
    const prev = before.current
    before.current = shown
    if (prev.join("\n") === key) return
    const entering = shown.filter(id => !prev.includes(id))
    const going = prev.filter(id => !shown.includes(id))
    setPhases(now => nextPhases(now, shown, false))
    for (const id of going) leaving.current(id)
    const after = (ms: number, step: (now: Phases) => Phases) =>
      timers.current.push(window.setTimeout(() => setPhases(step), ms))
    for (const id of entering)
      after(ENTER_FRAME_MS, now => (now[id] === ("enter" as Phase) ? { ...now, [id]: "idle" } : now))
    for (const id of going)
      after(LEAVE_REMOVE_MS, now => {
        if (now[id] !== "leave") return now
        const { [id]: _removed, ...rest } = now
        return rest
      })
  }, [key])
  return phases
}
