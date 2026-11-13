// 窓の状態。窓は、スクリーン（core/def/screen-def.ts の定義から開いた 1 枚ずつ）を何枚でも持ち、そのうち 1 枚を前に出す。
// 同じ定義・同じ渡す値でも別の 1 枚として開ける（1 枚ずつ id を振る。閉じたスクリーンの id も使い回さない）。
// 前に出した順（order）を覚え、最後が今の前。前のスクリーンを閉じたら、その 1 つ前に出していた物が前に出る。後ろに退いたスクリーンの中（ステージ・倍率・選択など）は残る。
// ステージを並べるスクリーン（定義が stages を名乗る。ブックスクリーン）は、開いた 1 枚ごとに、見ているもの（workspace.ts のステージの並び）を持つ。
// ステージの番号は窓で一意に振る（issued。どのスクリーンのステージでも、閉じたステージの番号も使い回さない）。
// 操作はデータを書き換えず、新しい値を返す（変わらなければ同じものを使い回す）

import type { CoreCatalog } from "./core-catalog"
import { fail } from "./errors"
import type { Book } from "./schema/book"
import type { Stage } from "./stage"
import { newWorkspace, type Workspace } from "./workspace"

// 開いているスクリーン 1 枚
export interface OpenedScreen {
  id: string // 開いた 1 枚ごとの id（窓で一意）
  def: string // スクリーンの定義の id
  props: unknown // 開くときに渡された値（定義の props の形）
  stages?: Workspace // ステージを並べるスクリーンの中（ステージの並び）
}

// ステージを並べるスクリーン（ブックスクリーン）
export type BookScreen = OpenedScreen & { stages: Workspace }

// カレントスクリーンの種類: ステージを並べるスクリーンか、そうでないスクリーンか
export type Front = "control-center" | "book-screen"

export interface WindowState {
  screens: readonly OpenedScreen[] // 開いているスクリーン（開いた順。1 枚以上で、ステージを並べるスクリーンを 1 枚以上持つ）
  order: readonly string[] // スクリーンの id を、カレントにした順に並べた物（最後がカレントスクリーン）
  arrangement: string // スクリーンアレンジメントの定義の id（開いているスクリーンの見せ方）
  issued: number // 最後に振ったステージの番号
  issuedScreens: number // 最後に振ったスクリーンの番号
}

// 機能台帳にスクリーンアレンジメントの定義が無いときの値（見えているのは、カレントスクリーンだけ）
export const NO_ARRANGEMENT = "none"

// 機能台帳にステージを並べるスクリーンの定義が無いときに、ステージの並びを持たせるスクリーンの定義の id（定義は無い）
export const NO_SCREEN_DEF = "none"

const holdsStages = (s: OpenedScreen): s is BookScreen => s.stages !== undefined

// 窓を開いたときの状態: 機能台帳の、最初から開いているスクリーン（定義が atStart を名乗る）と、ステージを並べるスクリーン 1 枚（ブックを渡せばそれを開き、無ければ何も開かない）。
// 前に出すのは、ステージを並べるスクリーン
export function newWindow(catalog: CoreCatalog, book: Book | null): WindowState {
  const defs = [...catalog.screens.values()]
  const stages = defs.find(d => d.stages)?.id ?? NO_SCREEN_DEF
  const arrangements = [...catalog.screenArrangements.values()]
  const arrangement = (arrangements.find(a => a.atStart) ?? arrangements[0])?.id ?? NO_ARRANGEMENT
  let win: WindowState = { screens: [], order: [], arrangement, issued: 0, issuedScreens: 0 }
  for (const d of defs) if (d.atStart && !d.stages) win = openScreen(win, catalog, d.id, {}).win
  return openScreen(win, catalog, stages, {}, book).win
}

// スクリーンを 1 枚開いて前に出す（ステージを並べるスクリーンなら、ステージ 1 つの並びを持たせ、ブックを渡せばそれを開く）。開いた 1 枚の id も返す
export function openScreen(
  win: WindowState,
  catalog: CoreCatalog,
  def: string,
  props: unknown,
  book: Book | null = null,
): { win: WindowState; id: string } {
  const id = `c${win.issuedScreens + 1}`
  const stages = def === NO_SCREEN_DEF || catalog.screens.get(def)?.stages === true
  const opened: OpenedScreen = stages
    ? { id, def, props, stages: newWorkspace(catalog, book, `s${win.issued + 1}`) }
    : { id, def, props }
  return {
    win: {
      ...win,
      screens: [...win.screens, opened],
      order: [...win.order, id],
      issued: stages ? win.issued + 1 : win.issued,
      issuedScreens: win.issuedScreens + 1,
    },
    id,
  }
}

// カレントスクリーン（キーが効く先。いつも 1 枚で、最後にカレントにした物）
export function currentScreen(win: Pick<WindowState, "screens" | "order">): OpenedScreen {
  const id = win.order[win.order.length - 1]
  return win.screens.find(s => s.id === id) ?? fail("E117", { index: String(id) })
}

// いちばん最近前に出した、種類 kind のスクリーン（stages はステージを並べるスクリーン、plain はそうでないスクリーン。無ければ undefined）
function recent(win: Pick<WindowState, "screens" | "order">, kind: "stages" | "plain"): OpenedScreen | undefined {
  for (let i = win.order.length - 1; i >= 0; i--) {
    const s = win.screens.find(x => x.id === win.order[i])
    if (s && holdsStages(s) === (kind === "stages")) return s
  }
  return undefined
}

// いちばん最近前に出した、ステージを並べるスクリーン（ほかのスクリーンを前に出している間も、後ろに残っている物）
export function recentBookScreen(win: Pick<WindowState, "screens" | "order">): BookScreen {
  return (recent(win, "stages") as BookScreen | undefined) ?? fail("E117", { index: "none" })
}

// いちばん最近前に出した、ステージを並べないスクリーン（無ければ undefined）
export const recentPlainScreen = (win: Pick<WindowState, "screens" | "order">): OpenedScreen | undefined =>
  recent(win, "plain")

// いちばん最近前に出したブックスクリーンの中（ステージの並び）
export function screenOf(win: Pick<WindowState, "screens" | "order">): Workspace {
  return recentBookScreen(win).stages
}

// いちばん最近前に出したブックスクリーンに操作をかける。変わらなければ同じ窓を返す
export function mapScreen(win: WindowState, change: (ws: Workspace) => Workspace): WindowState {
  const was = recentBookScreen(win)
  const next = change(was.stages)
  return next === was.stages
    ? win
    : { ...win, screens: win.screens.map(s => (s.id === was.id ? { ...s, stages: next } : s)) }
}

// ステージ stage を並べているブックスクリーンに操作をかける（そのステージが無ければ・変わらなければ同じ窓を返す）
export function mapScreenOfStage(win: WindowState, stage: string, change: (ws: Workspace) => Workspace): WindowState {
  const was = screenOfStage(win, stage)
  if (!was) return win
  const next = change(was.stages)
  return next === was.stages
    ? win
    : { ...win, screens: win.screens.map(s => (s.id === was.id ? { ...s, stages: next } : s)) }
}

// 全部のブックスクリーンに操作をかける（ブックが変わったときなど、後ろのブックスクリーンも合わせる）。変わらなければ同じ窓を返す
export function mapScreens(win: WindowState, change: (ws: Workspace) => Workspace): WindowState {
  const screens = win.screens.map(s => {
    if (!holdsStages(s)) return s
    const next = change(s.stages)
    return next === s.stages ? s : { ...s, stages: next }
  })
  return screens.every((s, i) => s === win.screens[i]) ? win : { ...win, screens }
}

// スクリーン id をカレントスクリーンにする（無い id・もうカレントなら同じ窓を返す）。見せるかは、スクリーンアレンジメントが決める
export function makeCurrent(win: WindowState, id: string): WindowState {
  if (win.order[win.order.length - 1] === id || !win.screens.some(s => s.id === id)) return win
  return { ...win, order: [...win.order.filter(x => x !== id), id] }
}

// 前に出す物の種類を替える: いちばん最近前に出した、その種類のスクリーンを前に出す（無ければ同じ窓を返す）
export function bringFrontKind(win: WindowState, front: Front): WindowState {
  const to = recent(win, front === "book-screen" ? "stages" : "plain")
  return to ? makeCurrent(win, to.id) : win
}

// スクリーン id を閉じる。最初から開いているスクリーン（定義が atStart を名乗る）の最後の 1 枚と、最後の 1 枚のブックスクリーンは閉じない（同じ窓を返す）。
// 前のスクリーンを閉じたら、その 1 つ前に出していた物が前に出る
export function closeScreen(win: WindowState, catalog: CoreCatalog, id: string): WindowState {
  const target = win.screens.find(s => s.id === id)
  if (!target) return win
  const only = win.screens.filter(s => s.def === target.def).length === 1
  if (only && catalog.screens.get(target.def)?.atStart) return win
  if (holdsStages(target) && win.screens.filter(holdsStages).length === 1) return win
  return { ...win, screens: win.screens.filter(s => s.id !== id), order: win.order.filter(x => x !== id) }
}

// 次のステージの番号を振る（窓で一意）
export function issueStage(win: WindowState): { win: WindowState; id: string } {
  const issued = win.issued + 1
  return { win: { ...win, issued }, id: `s${issued}` }
}

// カレントスクリーンの種類
export const frontOf = (win: Pick<WindowState, "screens" | "order">): Front =>
  holdsStages(currentScreen(win)) ? "book-screen" : "control-center"

// カレントスクリーンがブックスクリーン（ステージを並べるスクリーン）か。ステージのキーと、ステージでの操作が効くのは、この間
export const bookScreenCurrent = (win: Pick<WindowState, "screens" | "order">): boolean =>
  frontOf(win) === "book-screen"

// ステージの id から、そのステージ（どのブックスクリーンの物でも。ステージの id は窓で一意。無ければ undefined）
export function stageIn(win: Pick<WindowState, "screens">, id: string): Stage | undefined {
  for (const s of win.screens) {
    const stage = s.stages?.stages.find(st => st.id === id)
    if (stage) return stage
  }
  return undefined
}

// ステージの id から、そのステージを並べているブックスクリーン（無ければ undefined）
export function screenOfStage(win: Pick<WindowState, "screens">, id: string): BookScreen | undefined {
  return win.screens.find((s): s is BookScreen => s.stages?.stages.some(st => st.id === id) === true)
}

// ステージ stage を並べているブックスクリーンの中（ステージの並び。そのステージが無ければ、いちばん最近前に出したブックスクリーンの中）
export function workspaceOf(win: Pick<WindowState, "screens" | "order">, stage: string): Workspace {
  return screenOfStage(win, stage)?.stages ?? screenOf(win)
}

// 窓の全部のステージ（どのブックスクリーンのステージも。スクリーンを開いた順・左から）
export const allStages = (win: Pick<WindowState, "screens">): readonly Stage[] =>
  win.screens.flatMap(s => s.stages?.stages ?? [])

// 見えているスクリーンの id（スクリーンアレンジメントが答える。描いているスクリーンで、スクロールで画面の外にある物も含む）。
// 機能台帳に無いアレンジメントなら、カレントスクリーンだけ。開いていない id は除く
export function shownScreens(catalog: CoreCatalog, win: WindowState): readonly string[] {
  const def = catalog.screenArrangements.get(win.arrangement)
  if (!def) return [currentScreen(win).id]
  return def.shown(win.screens, win.order).filter(id => win.screens.some(s => s.id === id))
}

// 見えているブックスクリーン（開いた順）
export function shownBookScreens(catalog: CoreCatalog, win: WindowState): readonly BookScreen[] {
  const shown = shownScreens(catalog, win)
  return win.screens.filter((s): s is BookScreen => holdsStages(s) && shown.includes(s.id))
}

// スクリーンアレンジメントを替える（機能台帳に無い定義・今と同じなら同じ窓を返す）
export function setArrangement(win: WindowState, catalog: CoreCatalog, def: string): WindowState {
  return win.arrangement === def || !catalog.screenArrangements.has(def) ? win : { ...win, arrangement: def }
}
