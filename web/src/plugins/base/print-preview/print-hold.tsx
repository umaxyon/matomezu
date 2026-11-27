// 印刷を待たせる口: 印刷プレビューの印刷区画の中で、読み込みが済むまで刷れない物（画像など）を描くビューが、usePrintHold(done) で done になるまで刷れなくする。
// 印刷プレビューのビューが PrintHolds で並べた印刷区画を包み、待っている物の表を持つ。包みの外（ステージ・測るだけのビュー・刷るための写し）では何もしない
import { createContext, type ReactNode, useContext, useId, useLayoutEffect, useMemo } from "react"

interface Holds {
  hold(id: string): void
  release(id: string): void
}
const NO_HOLDS: Holds = { hold: () => {}, release: () => {} }
const HoldsContext = createContext<Holds>(NO_HOLDS)

// 描いている物が done になるまで、印刷を待たせる（印刷区画の中でだけ効く）。待つのは描いてからなので、描く前に数えられるよう、描いたすぐあとに知らせる
export function usePrintHold(done: boolean): void {
  const holds = useContext(HoldsContext)
  const id = useId()
  useLayoutEffect(() => {
    if (done) return
    holds.hold(id)
    return () => holds.release(id)
  }, [done, holds, id])
}

// waiting は、待っている物の id の表（包む側が持ち、刷れるかを決めるときに読む）。onChange は、表が変わったときに呼ぶ
export function PrintHolds({
  waiting,
  onChange,
  children,
}: {
  waiting: Set<string>
  onChange(): void
  children: ReactNode
}) {
  const holds = useMemo<Holds>(
    () => ({
      hold: id => {
        waiting.add(id)
        onChange()
      },
      release: id => {
        waiting.delete(id)
        onChange()
      },
    }),
    [waiting, onChange],
  )
  return <HoldsContext.Provider value={holds}>{children}</HoldsContext.Provider>
}
