// 右サイドパネルを開け閉めするフック（持ち方は state.ts）。窓に 1 つだけで、守るのは入れ物（RightSidePanel）。
// 開くのは、ステージに置いてそのステージをカレントにするだけ（ほかのステージで開いていた物は、入れ物が閉じる）
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useSetStageState, useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { panelIn, type RightSidePanelOpen, withOpened, withoutAnchor, withPanel } from "./state"

export const SLIDE_MS = 250 // 開け閉めでステージの列とサイドパネル（右と左）の幅を動かす時間（CSS の変数 --side-panel-slide で渡す）

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

// 右サイドパネルを開く関数: ステージ stage で、中身 widget に物 subject（付いた先は anchors、カレントは current）を見せる（閉じたら戻すため、開く前の見え方も覚える）。
// 選択に従う中身なら、入れ物が開いたときにステージの選択を anchors にする。右サイドパネルを閉じたのと同じ押しなら開かない。
// restore が none なら、閉じたときに見え方を戻さない（開く前の見え方を覚えない。戻す見え方を自分で持つ物。印刷プレビューなど）
export function useOpenRightSidePanel(): (
  stage: string,
  open: Pick<RightSidePanelOpen, "widget" | "subject" | "anchors" | "current">,
  restore?: "back" | "none",
) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  const { focusStage } = useActions()
  const pressClosed = useContext(PressClosedContext)
  return useCallback(
    (stage, open, restore = "back") => {
      if (pressClosed.current) return
      const { workspace, stageStates } = read()
      const now = workspace.stages.find(s => s.id === stage)
      const opened = now?.opened
      if (!now || !opened) return
      const state = stageStates[stage]?.[kit.id]
      const panel = { ...open, book: opened.book, page: opened.page }
      set(stage, restore === "back" ? withOpened(state, panel, now) : withPanel(state, panel))
      focusStage(stage)
    },
    [read, set, focusStage, pressClosed],
  )
}

// ステージ stage で、選択に従う右サイドパネルの中身が開いているか（開いている間は、選択は付いた先を選ぶ物になる。
// 紙のビューなどは、この間は階層の違う物も混ぜて選ばせ、押しても物を動かさない）
export function useFollowsSelection(stage: string): boolean {
  const open = useRightSidePanel(stage)
  const widgets = useUiCatalog().widgets
  return !!open && !!widgets.get(open.widget)?.rightSidePanel?.followsSelection
}

// 選択に従う中身で、ステージ stage の付いた先から anchor を外す関数: 選択からも外し、カレントは一つ前の物へ（state.ts の withoutAnchor）。残りが無ければ閉じる
export function useTakeOffAnchor(): (stage: string, anchor: string) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  const { select } = useActions()
  const close = useCloseRightSidePanel()
  return useCallback(
    (stage, anchor) => {
      const now = read().stageStates[stage]?.[kit.id]
      const open = panelIn(now)
      if (!open) return
      const next = withoutAnchor(open, anchor)
      if (next.anchors.length === 0) {
        close(stage)
        return
      }
      set(stage, withPanel(now, next))
      select(stage, next.anchors)
    },
    [read, set, select, close],
  )
}

// ステージ stage の右サイドパネルのカレントを、付いた先の 1 つ anchor にする関数（付いた先の並びも、ステージの選択も変えない）
export function useSetRightSidePanelCurrent(): (stage: string, anchor: string) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  return useCallback(
    (stage, anchor) => {
      const now = read().stageStates[stage]?.[kit.id]
      const open = panelIn(now)
      if (open?.anchors.includes(anchor) && open.current !== anchor)
        set(stage, withPanel(now, { ...open, current: anchor }))
    },
    [read, set],
  )
}

// ステージ stage の右サイドパネルが見せる物を、同じ中身のまま subject（付いた先 anchors、カレント current）に替える関数
// （開いていなければ何もしない。閉じたときに戻す見え方の覚えは、そのまま持つ）
export function useReplaceRightSidePanelSubject(): (
  stage: string,
  open: Pick<RightSidePanelOpen, "subject" | "anchors" | "current">,
) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  return useCallback(
    (stage, change) => {
      const now = read().stageStates[stage]?.[kit.id]
      const open = panelIn(now)
      if (open) set(stage, withPanel(now, { ...open, ...change }))
    },
    [read, set],
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

// サイドパネル（右か左）を開いたステージが替わってから、幅を動かし終えるまで true（替わったのと同じ描き方で true にし、列の幅と一緒に動きを付ける）。
// 動き終わりの合図は、これが false に戻ること（動きを減らす設定では、すぐ戻る）
export function useSidePanelSliding(stage: string | null): boolean {
  const [settled, setSettled] = useState(stage)
  useEffect(() => {
    if (settled === stage) return
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    const timer = setTimeout(() => setSettled(stage), reduced ? 0 : SLIDE_MS)
    return () => clearTimeout(timer)
  }, [stage, settled])
  return stage !== settled
}
