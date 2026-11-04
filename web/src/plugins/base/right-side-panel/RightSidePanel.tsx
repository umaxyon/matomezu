// 右サイドパネルの入れ物: ステージの列の右に、窓の上から下まで出す。幅は開いている中身のウィジェットの定義の rightSidePanel（無ければ既定の幅。窓より広ければ窓の幅で、ステージを覆う）で、
// 開け閉めのときは幅を動かす（動きを減らす設定では動かさない）。見出しに閉じるボタンを置き、中身は、配置がスロットに置いたウィジェットのうち開いている 1 つだけを描く。
// 窓に 1 つだけで、ほかのステージでも開いていれば、カレントでない方を閉じる。開いたら中にフォーカスを入れ、Esc は右サイドパネルのキーの範囲で閉じる。
// 外を左ボタンで押したら閉じる（ステージの道具がずらす道具のときと、ダイアログ・メニュー・トースト・ツールバーを押したときは閉じない。右ボタンはメニューと道具のアイコンを出すので閉じない）。
// 開いたステージで開いているブックかページが替わったとき、分けたり分けるのをやめたりしたときも閉じる。
// 選択に従う中身（ウィジェットの定義の rightSidePanel.followsSelection）を出している間は、開いたステージの中を押しても閉じず、付いた先をステージの選択に合わせる
// （ポインタを押している間は、離してから。state.ts の followSelection）。開いたステージの中を押して離したあとに付いた先が空なら閉じる（AI が物を消すなど、押さずに空になったときは閉じない）
import { type ReactNode, useContext, useEffect, useRef, useState } from "react"
import { stageView, toolOf } from "../../../core/workspace"
import { useMessages } from "../../../ui/i18n"
import { useActions, useLayout, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useCoreCatalog, useSetStageState, useStage, useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { stageElement } from "../utils/stage-element"
import type { StageSlotProps } from "../workspace/ui"
import {
  PressClosedContext,
  useCloseRightSidePanel,
  useOpenedRightSidePanel,
  useStagesWithRightSidePanel,
} from "./hooks"
import styles from "./RightSidePanel.module.css"
import { RIGHT_SIDE_PANEL } from "./slots"
import {
  closesOnRelease,
  followSelection,
  panelIn,
  pressCloses,
  type RightSidePanelOpen,
  stillOn,
  withPanel,
} from "./state"

const WIDTH = 480 // 中身のウィジェットが幅を書いていないときの幅（px。PC のブラウザの窓をいちばん狭くしても入る幅）

// 押しても右サイドパネルを閉じない所（ダイアログ・メニュー・トースト・道具を替えるツールバー）
const KEEPS = "[role=dialog], [role=menu], [role=status], [role=alert], [role=toolbar]"

export function RightSidePanel() {
  const t = useMessages(kit)
  // 開いている中身が、配置がスロットに置いたウィジェットでなければ開かない
  const placed: readonly string[] = useLayout().slots[RIGHT_SIDE_PANEL] ?? []
  const found = useOpenedRightSidePanel()
  const opened = found && placed.includes(found.open.widget) ? found : null
  const widget = useUiCatalog().widgets.get(opened?.open.widget ?? "")
  const width = opened ? `min(${widget?.rightSidePanel?.width ?? WIDTH}px, 100vw)` : 0
  const ref = useRef<HTMLElement>(null)
  const close = useCloseRightSidePanel()
  const read = useReadState()
  const catalog = useCoreCatalog()
  const pressClosed = useContext(PressClosedContext)
  // 窓に 1 つ: 開いているのと別のステージでも開いていれば閉じる
  const all = useStagesWithRightSidePanel()
  useEffect(() => {
    for (const stage of all) if (stage !== found?.stage) close(stage)
  }, [all, found?.stage, close])
  // 押すたびに、この押しで閉じたかを決める（決め方は state.ts の pressCloses）
  const stage = opened?.stage ?? null
  const followed = !!widget?.rightSidePanel?.followsSelection
  useFollowSelection(followed ? stage : null)
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      pressClosed.current = false
      const target = e.target instanceof Element ? e.target : null
      if (!stage || !target) return
      const s = read()
      const tool = toolOf(catalog, s.workspace, stage, s.books)
      const inside = ref.current?.contains(target) ?? false
      const st = s.workspace.stages.find(st => st.id === stage)
      const pans = !!st && stageView(catalog, st, tool).pans // 紙をずらしているか（ずらす道具の間と、印刷プレビューの間）
      const inStage = followed && (stageElement(stage)?.contains(target) ?? false)
      if (!pressCloses({ button: e.button, inside, kept: !!target.closest(KEEPS), pans, followed: inStage })) return
      pressClosed.current = true
      close(stage)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [stage, followed, read, catalog, close, pressClosed])
  return (
    <aside
      ref={ref}
      className={styles.panel}
      style={{ width }}
      aria-hidden={!opened}
      inert={!opened}
      aria-label={t("Right side panel")}
    >
      {opened && (
        <Opened
          key={`${opened.stage} ${opened.open.widget} ${opened.open.subject}`}
          stage={opened.stage}
          open={opened.open}
          width={width}
        />
      )}
    </aside>
  )
}

// 選択に従う中身を出しているステージ stage（無ければ null）で、付いた先をステージの選択に合わせる。開いたとき（中身か見せる物が替わったとき）は、先に選択を付いた先にする。
// ポインタを押している間は合わせず、離してから合わせ、そのとき閉じるかを決める（state.ts の closesOnRelease。離したあとの click で選択を変える物もあるので、click のあとに見る）。
// 閉じたら（従う中身でなくなったら）選択を外す
function useFollowSelection(stage: string | null) {
  const read = useReadState()
  const { select } = useActions()
  const set = useSetStageState(kit)
  const close = useCloseRightSidePanel()
  const opened = useOpenedRightSidePanel()
  const selection = useStage(stage ?? "")?.selection
  const following = useRef<string | null>(null)
  useEffect(() => {
    const was = following.current
    following.current = stage
    if (was && was !== stage) select(was, [])
  }, [stage, select])
  // 開いたとき: 選択を付いた先にする
  const shown = stage && opened ? `${stage} ${opened.open.widget} ${opened.open.subject}` : null
  const synced = useRef<string | null>(null)
  const anchors = opened?.open.anchors
  // biome-ignore lint/correctness/useExhaustiveDependencies: 開いたときに一度だけ（付いた先が替わるたびではない）
  useEffect(() => {
    if (shown === synced.current) return
    synced.current = shown
    if (!stage) return
    if (shown && anchors) select(stage, anchors)
  }, [stage, shown, select])
  const pressing = useRef(false)
  const pressedInStage = useRef(false)
  const [released, setReleased] = useState(0)
  const checked = useRef(released)
  useEffect(() => {
    if (!stage) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const down = (e: PointerEvent) => {
      pressing.current = true
      pressedInStage.current = e.target instanceof Node && (stageElement(stage)?.contains(e.target) ?? false)
    }
    const up = () => {
      pressing.current = false
      clearTimeout(timer)
      timer = setTimeout(() => setReleased(n => n + 1), 0)
    }
    document.addEventListener("pointerdown", down, true)
    document.addEventListener("pointerup", up, true)
    document.addEventListener("pointercancel", up, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("pointerdown", down, true)
      document.removeEventListener("pointerup", up, true)
      document.removeEventListener("pointercancel", up, true)
    }
  }, [stage])
  // biome-ignore lint/correctness/useExhaustiveDependencies: 選択が変わるたびに合わせる（値はストアから今のものを読む）
  useEffect(() => {
    if (!stage || pressing.current || shown !== synced.current) return
    const now = read().stageStates[stage]?.[kit.id]
    const open = panelIn(now)
    if (!open) return
    // 開いたときに選択を変えたばかりのこともあるので、選択はストアから今の値を読む
    const current = read().workspace.stages.find(s => s.id === stage)?.selection ?? []
    const next = followSelection(open, current)
    const release = checked.current !== released
    checked.current = released
    if (release && closesOnRelease({ pressedInStage: pressedInStage.current, anchors: next.anchors })) close(stage)
    else if (next !== open) set(stage, withPanel(now, next))
  }, [stage, shown, selection, released, read, set, close])
}

function Opened({ stage, open, width }: { stage: string; open: RightSidePanelOpen; width: string | number }) {
  const t = useMessages(kit)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCloseRightSidePanel()
  const view = useStage(stage)
  const stages = useMatomezuState(s => s.workspace.stages.length)
  // 開いたら中にフォーカスを入れる（Esc を右サイドパネルのキーの範囲で受けるため。中の物がもう取っていれば、そのまま）
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true })
  }, [])
  // 開いたときのブックかページから替わったか、ステージの数が変わったら閉じる
  const first = useRef(stages)
  const moved = !!view && !stillOn(open, view)
  useEffect(() => {
    if (moved || stages !== first.current) close(stage)
  }, [moved, stages, stage, close])
  return (
    <div ref={ref} className={styles.opened} style={{ width }} tabIndex={-1} data-key-scope={RIGHT_SIDE_PANEL}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.close}
          aria-label={t("Close the right side panel")}
          onClick={() => close(stage)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>
        <Content stage={stage} widget={open.widget} />
      </div>
    </div>
  )
}

// 開いている中身: 配置が右サイドパネルのスロットに置いたウィジェットのうち、開いている 1 つだけを描く
function Content({ stage, widget }: { stage: string; widget: string }) {
  const View = useUiCatalog().widgets.get(widget)?.view as ((props: StageSlotProps) => ReactNode) | undefined
  return View ? <View stage={stage} /> : null
}
