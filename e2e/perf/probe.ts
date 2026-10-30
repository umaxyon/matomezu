// 画面の中で数値を取る仕掛け。page.addInitScript で、画面のスクリプトより先に入れる。
// - 1 コマの時間: requestAnimationFrame の間隔を、測っている間だけ記録する
// - 長い処理: 50ms を超えた処理（longtask）を記録する
// - 描き直した数: React の開発者ツールの口（__REACT_DEVTOOLS_GLOBAL_HOOK__。本番のビルドでも呼ばれる）で、
//   コミットのたびに、描き直したコンポーネントの数と、図の要素（アイテム [data-item]・ツリーの節 [data-node]・ディレクトリ構成図の中身 [data-entry]）を
//   描き直した数をステージごとに数える
// - 開くまでの時間: 図の要素が want 個そろった時点（ページを開き始めてからの ms）
import type { Page } from "@playwright/test"

export interface Probe {
  frames: number[] // 記録している間の 1 コマの時間（ms）
  longTasks: { start: number; duration: number }[]
  commits: number
  renders: number // 描き直したコンポーネント
  itemRedraws: Record<string, number> // ステージ（data-stage）ごとの、図の要素を描き直した数
  recording: boolean
  want: number // そろうのを待つ図の要素の数（0 なら待たない）
  ready: number | null // want 個そろった時点
}

type ProbeWindow = Window & { __perf: Probe }

function install() {
  const PARTS = "[data-item], [data-node], [data-entry]" // 図の要素
  const perf: Probe = {
    frames: [],
    longTasks: [],
    commits: 0,
    renders: 0,
    itemRedraws: {},
    recording: false,
    want: 0,
    ready: null,
  }
  ;(window as unknown as ProbeWindow).__perf = perf
  let last = 0
  const tick = (t: number) => {
    if (perf.recording && last > 0) perf.frames.push(t - last)
    last = t
    if (perf.want > 0 && perf.ready === null && document.querySelectorAll(PARTS).length >= perf.want) perf.ready = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) perf.longTasks.push({ start: e.startTime, duration: e.duration })
  }).observe({ type: "longtask", buffered: true })

  // React の Fiber の印（react-reconciler の値）
  const PERFORMED_WORK = 1
  const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]) // 関数・クラス・forwardRef・memo・単純な memo
  const HOST = 5
  type Fiber = {
    tag: number
    flags: number
    child: Fiber | null
    sibling: Fiber | null
    alternate: Fiber | null
    memoizedProps: unknown
    stateNode: unknown
  }
  // このコミットで描き直した所だけを辿る（子の並びが前と同じなら、その下は描き直していない）
  const walk = (fiber: Fiber) => {
    const prev = fiber.alternate
    if (COMPONENT_TAGS.has(fiber.tag) && (fiber.flags & PERFORMED_WORK) !== 0) perf.renders++
    if (fiber.tag === HOST && (prev === null || prev.memoizedProps !== fiber.memoizedProps)) {
      const el = fiber.stateNode as Element
      if (el.matches?.(PARTS)) {
        const stage = el.closest("[data-stage]")?.getAttribute("data-stage") ?? "?"
        perf.itemRedraws[stage] = (perf.itemRedraws[stage] ?? 0) + 1
      }
    }
    if (prev !== null && fiber.child === prev.child) return
    for (let c = fiber.child; c !== null; c = c.sibling) walk(c)
  }
  ;(window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject: () => 1,
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
      if (!perf.recording) return
      perf.commits++
      walk(root.current)
    },
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
  }
}

export const installProbe = (page: Page) => page.addInitScript(install)

// 開く前に、そろうのを待つ図の要素の数を決める
export const awaitItems = (page: Page, want: number) =>
  page.addInitScript(n => {
    const set = () => {
      const w = window as unknown as ProbeWindow
      if (w.__perf) w.__perf.want = n
      else setTimeout(set, 0)
    }
    set()
  }, want)

export const readyAt = (page: Page) => page.evaluate(() => (window as unknown as ProbeWindow).__perf.ready)

// 記録を空にして始める
export const startRecording = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as ProbeWindow).__perf
    p.frames = []
    p.longTasks = []
    p.commits = 0
    p.renders = 0
    p.itemRedraws = Object.fromEntries(
      [...document.querySelectorAll("[data-stage]")].map(s => [s.getAttribute("data-stage") ?? "?", 0]),
    )
    p.recording = true
    return performance.now()
  })

// 記録を止めて、始めてからの記録を返す
export const stopRecording = (page: Page, since: number) =>
  page.evaluate(since => {
    const p = (window as unknown as ProbeWindow).__perf
    p.recording = false
    return {
      frames: p.frames,
      longTasks: p.longTasks.filter(t => t.start >= since),
      commits: p.commits,
      renders: p.renders,
      itemRedraws: p.itemRedraws,
    }
  }, since)
