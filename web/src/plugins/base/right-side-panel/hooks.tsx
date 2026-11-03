// 右サイドパネルを開け閉めするフック（持ち方は state.ts）。窓に 1 つだけで、守るのは入れ物（RightSidePanel）。
// 開くのは、ステージに置いてそのステージをカレントにするだけ（ほかのステージで開いていた物は、入れ物が閉じる）
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useSetStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { panelIn, type RightSidePanelOpen, withOpened, withPanel } from "./state"

export const SLIDE_MS = 250 // 開け閉めでステージの列と右サイドパネルの幅を動かす時間（CSS の変数 --right-side-panel-slide で渡す）

// 今の押しで右サイドパネルを閉じたか（入れ物が押すたびに決める。閉じたのと同じ押しの click で、押した物がまた開かないように）
export const PressClosedContext = createContext<{ current: boolean }>({ current: false })

// 右サイドパネルを開いているステージ（カレントのステージで開いていればそれ。どこも開いていなければ null）と、開いている物
export function useOpenedRightSidePanel(): { stage: string; open: RightSidePanelOpen } | null {
  const stage = useMatomezuState(s => {
    const ids = s.workspace.stages.map(st => st.id).filter(id => panelIn(s.stageStates[id]?.[kit.id]))
    return ids.includes(s.workspace.current) ? s.workspace.current : (ids[0] ?? null)
  })
  const open = useMatomezuState(s => (stage ? panelIn(s.stageStates[stage]?.[kit.id]) : null))
  return stage && open ? { stage, open } : null
}

// 右サイドパネルを開いている、どのステージか（入れ物が、窓に 1 つを守るのに使う）
export const useStagesWithRightSidePanel = (): readonly string[] =>
  useMatomezuState(
    useShallow(s => s.workspace.stages.map(st => st.id).filter(id => panelIn(s.stageStates[id]?.[kit.id]))),
  )

// ステージ stage の右サイドパネル（開いていなければ null）
export const useRightSidePanel = (stage: string): RightSidePanelOpen | null =>
  useMatomezuState(s => panelIn(s.stageStates[stage]?.[kit.id]))

// 右サイドパネルを開く関数: ステージ stage で、中身 widget に物 subject（付いた先は anchor）を見せる（閉じたら戻すため、開く前の見え方も覚える）。右サイドパネルを閉じたのと同じ押しなら開かない
export function useOpenRightSidePanel(): (
  stage: string,
  open: Pick<RightSidePanelOpen, "widget" | "subject" | "anchor">,
) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  const { focusStage } = useActions()
  const pressClosed = useContext(PressClosedContext)
  return useCallback(
    (stage, open) => {
      if (pressClosed.current) return
      const { workspace, stageStates } = read()
      const now = workspace.stages.find(s => s.id === stage)
      const opened = now?.opened
      if (!now || !opened) return
      set(stage, withOpened(stageStates[stage]?.[kit.id], { ...open, book: opened.book, page: opened.page }, now))
      focusStage(stage)
    },
    [read, set, focusStage, pressClosed],
  )
}

// ステージ stage の右サイドパネルを閉じる関数
export function useCloseRightSidePanel(): (stage: string) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  return useCallback(
    stage => {
      const now = read().stageStates[stage]?.[kit.id]
      if (panelIn(now)) set(stage, withPanel(now, null))
    },
    [read, set],
  )
}

// 右サイドパネルを開いたステージが替わってから、幅を動かし終えるまで true（替わったのと同じ描き方で true にし、列の幅と一緒に動きを付ける）。
// 動き終わりの合図は、これが false に戻ること（動きを減らす設定では、すぐ戻る）
export function useRightSidePanelSliding(stage: string | null): boolean {
  const [settled, setSettled] = useState(stage)
  useEffect(() => {
    if (settled === stage) return
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    const timer = setTimeout(() => setSettled(stage), reduced ? 0 : SLIDE_MS)
    return () => clearTimeout(timer)
  }, [stage, settled])
  return stage !== settled
}
