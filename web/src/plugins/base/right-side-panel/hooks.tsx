// 右サイドパネルを開け閉めするフック（持ち方は state.ts）。窓に 1 つだけで、守るのは入れ物（RightSidePanel）。
// 開くのは、ステージに置いてそのステージをカレントにするだけ（ほかのステージで開いていた物は、入れ物が閉じる）

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { shownPageId } from "../../../core/stage"
import { screenOf, stageIn } from "../../../core/window"
import { type PluginValues, pluginValueOf } from "../../../store/plugin-state"
import { useReadPluginStateAt, useSetPluginStateAt, useSetPluginStatesAt } from "../../../ui/at-hooks"
import { useStageId } from "../../../ui/scope"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { SLIDE_MS } from "../window/slide"
import {
  openedRestore,
  RIGHT_SIDE_PANEL_RESTORE_STATE,
  RIGHT_SIDE_PANEL_STATE,
  type RightSidePanelOpen,
  withoutAnchor,
} from "./state"

const panelOf = (s: { pluginValues: PluginValues }, stage: string) =>
  pluginValueOf(s.pluginValues, stage, RIGHT_SIDE_PANEL_STATE)

// 今の押しで右サイドパネルを閉じたか（入れ物が押すたびに決める。閉じたのと同じ押しの click で、押した物がまた開かないように）
export const PressClosedContext = createContext<{ current: boolean }>({ current: false })

// 右サイドパネルを開いているステージ（カレントのステージで開いていればそれ。どこも開いていなければ null）と、開いている物
export function useOpenedRightSidePanel(): { stage: string; open: RightSidePanelOpen } | null {
  const stage = useMatomezuState(s => {
    const ids = screenOf(s.window)
      .stages.map(st => st.id)
      .filter(id => panelOf(s, id))
    return ids.includes(screenOf(s.window).current) ? screenOf(s.window).current : (ids[0] ?? null)
  })
  const open = useMatomezuState(s => (stage ? panelOf(s, stage) : undefined))
  return stage && open ? { stage, open } : null
}

// 右サイドパネルを開いている、どのステージか（入れ物が、窓に 1 つを守るのに使う）
export const useStagesWithRightSidePanel = (): readonly string[] =>
  useMatomezuState(
    useShallow(s =>
      screenOf(s.window)
        .stages.map(st => st.id)
        .filter(id => panelOf(s, id)),
    ),
  )

// ステージ stage の右サイドパネル（開いていなければ null。stage が null なら null）
export const useRightSidePanelAt = (stage: string | null): RightSidePanelOpen | null =>
  useMatomezuState(s => (stage === null ? null : (panelOf(s, stage) ?? null)))

// 右サイドパネルを開く関数（開くとブックスクリーンを前に出す）: ステージ stage で、中身 widget に物 subject（付いた先は anchors、カレントは current）を見せる（閉じたら戻すため、開く前の見え方も覚える）。
// 選択に従う中身なら、入れ物が開いたときにステージの選択を anchors にする。右サイドパネルを閉じたのと同じ押しなら開かない。
// restore が none なら、閉じたときに見え方を戻さない（開く前の見え方を覚えない。戻す見え方を自分で持つ物。印刷プレビューなど）
export function useOpenRightSidePanelAt(): (
  stage: string,
  open: Pick<RightSidePanelOpen, "widget" | "subject" | "anchors" | "current">,
  restore?: "back" | "none",
) => void {
  const read = useReadState()
  const readRestore = useReadPluginStateAt(kit, RIGHT_SIDE_PANEL_RESTORE_STATE)
  const setStates = useSetPluginStatesAt(kit)
  const { showStage } = useStoreActions()
  const pressClosed = useContext(PressClosedContext)
  return useCallback(
    (stage, open, restore = "back") => {
      if (pressClosed.current) return
      const { window } = read()
      const now = stageIn(window, stage)
      const opened = now?.opened
      if (!now || !opened) return
      const panel = { ...open, book: opened.outermost, page: shownPageId(opened) }
      setStates(
        restore === "back"
          ? [
              [RIGHT_SIDE_PANEL_STATE, stage, panel],
              [RIGHT_SIDE_PANEL_RESTORE_STATE, stage, openedRestore(readRestore(stage), panel, now)],
            ]
          : [[RIGHT_SIDE_PANEL_STATE, stage, panel]],
      )
      showStage(stage)
    },
    [read, readRestore, setStates, showStage, pressClosed],
  )
}

// ステージ stage で、選択に従う右サイドパネルの中身が開いているか（開いている間は、選択は付いた先を選ぶ物になる。
// 紙のビューなどは、この間は階層の違う物も混ぜて選ばせ、押しても物を動かさない）
export function useFollowsSelectionAt(stage: string | null): boolean {
  const open = useRightSidePanelAt(stage)
  const widgets = useUiCatalog().widgets
  return !!open && !!widgets.get(open.widget)?.rightSidePanel?.followsSelection
}

// 選択に従う中身で、ステージ stage の付いた先から anchor を外す関数: 選択からも外し、カレントは一つ前の物へ（state.ts の withoutAnchor）。残りが無ければ閉じる
export function useTakeOffAnchorAt(): (stage: string, anchor: string) => void {
  const readPanel = useReadPluginStateAt(kit, RIGHT_SIDE_PANEL_STATE)
  const set = useSetPluginStateAt(kit, RIGHT_SIDE_PANEL_STATE)
  const { select } = useStoreActions()
  const close = useCloseRightSidePanelAt()
  return useCallback(
    (stage, anchor) => {
      const open = readPanel(stage)
      if (!open) return
      const next = withoutAnchor(open, anchor)
      if (next.anchors.length === 0) {
        close(stage)
        return
      }
      set(stage, next)
      select(stage, next.anchors)
    },
    [readPanel, set, select, close],
  )
}

// ステージ stage の右サイドパネルのカレントを、付いた先の 1 つ anchor にする関数（付いた先の並びも、ステージの選択も変えない）
export function useSetRightSidePanelCurrentAt(): (stage: string, anchor: string) => void {
  const readPanel = useReadPluginStateAt(kit, RIGHT_SIDE_PANEL_STATE)
  const set = useSetPluginStateAt(kit, RIGHT_SIDE_PANEL_STATE)
  return useCallback(
    (stage, anchor) => {
      const open = readPanel(stage)
      if (open?.anchors.includes(anchor) && open.current !== anchor) set(stage, { ...open, current: anchor })
    },
    [readPanel, set],
  )
}

// ステージ stage の右サイドパネルを閉じる関数
export function useCloseRightSidePanelAt(): (stage: string) => void {
  const set = useSetPluginStateAt(kit, RIGHT_SIDE_PANEL_STATE)
  return useCallback(stage => set(stage, undefined), [set])
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

// ここから下は、描いている場所（ui/scope.tsx）のステージの右サイドパネルを読み書きするフック（プラグインと、骨組みでない部品が使う。ステージを名指さない）。
// 描いている場所がステージでなければ（ステージの外で見るだけに描くページの中など）、開いておらず、開け閉めもしない

// 描いている場所のステージの右サイドパネル（開いていなければ null）
export const useRightSidePanel = (): RightSidePanelOpen | null => useRightSidePanelAt(useStageId())

// 描いている場所のステージで、右サイドパネルを開く関数（開き方は useOpenRightSidePanelAt と同じ）
export function useOpenRightSidePanel(): (
  open: Pick<RightSidePanelOpen, "widget" | "subject" | "anchors" | "current">,
  restore?: "back" | "none",
) => void {
  const stage = useStageId()
  const openAt = useOpenRightSidePanelAt()
  return useCallback(
    (open, restore) => {
      if (stage !== null) openAt(stage, open, restore)
    },
    [stage, openAt],
  )
}

// 描いている場所のステージで、選択に従う右サイドパネルの中身が開いているか
export const useFollowsSelection = (): boolean => useFollowsSelectionAt(useStageId())

// 描いている場所のステージの、付いた先から anchor を外す関数
export function useTakeOffAnchor(): (anchor: string) => void {
  const stage = useStageId()
  const takeOff = useTakeOffAnchorAt()
  return useCallback(
    anchor => {
      if (stage !== null) takeOff(stage, anchor)
    },
    [stage, takeOff],
  )
}

// 描いている場所のステージの、右サイドパネルのカレントを anchor にする関数
export function useSetRightSidePanelCurrent(): (anchor: string) => void {
  const stage = useStageId()
  const setCurrent = useSetRightSidePanelCurrentAt()
  return useCallback(
    anchor => {
      if (stage !== null) setCurrent(stage, anchor)
    },
    [stage, setCurrent],
  )
}

// 描いている場所のステージの、右サイドパネルを閉じる関数
export function useCloseRightSidePanel(): () => void {
  const stage = useStageId()
  const close = useCloseRightSidePanelAt()
  return useCallback(() => {
    if (stage !== null) close(stage)
  }, [stage, close])
}
