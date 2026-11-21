// 窓の状態。窓は、スクリーン（core/def/screen-def.ts の定義から開いた 1 枚ずつ）を何枚でも持ち、そのうち 1 枚がカレントスクリーン（どれを見せるかは、スクリーンアレンジメントが決める）。
// 同じ定義・同じ渡す値でも別の 1 枚として開ける（1 枚ずつ id を振る。閉じたスクリーンの id も使い回さない）。
// カレントにした順（order）を覚え、最後がカレントスクリーン。カレントスクリーンを閉じたら、その 1 つ前にカレントだった物がカレントになる。カレントでないスクリーンの中（ステージ・倍率・選択など）は残る。
// ステージを並べるスクリーン（定義が stages を名乗る。ブックスクリーン）は、開いた 1 枚ごとに、見ているもの（workspace.ts のステージの並び）を持つ。
// ステージの番号は窓で一意に振る（issued。どのスクリーンのステージでも、閉じたステージの番号も使い回さない）。
// 操作はデータを書き換えず、新しい値を返す（変わらなければ同じものを使い回す）

import type { CoreCatalog } from "./core-catalog"
import { arrangementValueOf, NO_ARRANGEMENT_VALUE } from "./def/screen-arrangement"
import { fail } from "./errors"
import type { Library } from "./folders"
import { sameData } from "./same"
import type { Book } from "./schema/book"
import type { ItemPage } from "./placed"
import { openBook, openOutsidePage, type Stage } from "./stage"
import { emptied, focus, followLibrary, mapStage, NO_STAGES_LEFT, newWorkspace, type Workspace } from "./workspace"

// 開いているスクリーン 1 枚
export interface OpenedScreen {
  id: string // 開いた 1 枚ごとの id（窓で一意）
  def: string // スクリーンの定義の id
  props: unknown // 開くときに渡された値（定義の props の形）
  stages?: Workspace // ステージを並べるスクリーンの中（ステージの並び）
}

// ステージを並べるスクリーン（ブックスクリーン）
export type BookScreen = OpenedScreen & { stages: Workspace }

// AI に見せる（view の current）、カレントスクリーンの種類: ステージを並べるスクリーン（book-screen）か、そうでないスクリーン（control-center。コントロールセンターのほかのスクリーンも）
export type CurrentKind = "control-center" | "book-screen"

export interface WindowState {
  screens: readonly OpenedScreen[] // 開いているスクリーン（開いた順。1 枚以上。ステージを並べるスクリーンは 0 枚でもよい）
  order: readonly string[] // スクリーンの id を、カレントにした順に並べた物（最後がカレントスクリーン）
  arrangement: string // スクリーンアレンジメントの定義の id（開いているスクリーンの見せ方）
  arrangementValue: unknown // スクリーンアレンジメントの値（定義の value の形。値を持たない定義なら NO_ARRANGEMENT_VALUE）
  issued: number // 最後に振ったステージの番号
  issuedScreens: number // 最後に振ったスクリーンの番号
}

// 機能台帳にスクリーンアレンジメントの定義が無いときの値（見えているのは、カレントスクリーンだけ）
export const NO_ARRANGEMENT = "none"

// 機能台帳にステージを並べるスクリーンの定義が無いときに、ステージの並びを持たせるスクリーンの定義の id（定義は無い）
export const NO_SCREEN_DEF = "none"

const holdsStages = (s: OpenedScreen): s is BookScreen => s.stages !== undefined

// 窓を開いたときの状態: 機能台帳の、最初から開いているスクリーン（定義が atStart を名乗る）だけを開く（ステージを並べるスクリーンは開かない）。
// 最初から開いているスクリーンが 1 枚も無い機能台帳なら、ステージを並べるスクリーンを 1 枚（何も開かないステージ 1 つ）開く（窓はスクリーンを 1 枚以上持つ）
export function newWindow(catalog: CoreCatalog): WindowState {
  const defs = [...catalog.screens.values()]
  const arrangements = [...catalog.screenArrangements.values()]
  const first = arrangements.find(a => a.atStart) ?? arrangements[0]
  const arrangement = first?.id ?? NO_ARRANGEMENT
  const arrangementValue = first?.value?.initial ?? NO_ARRANGEMENT_VALUE
  let win: WindowState = { screens: [], order: [], arrangement, arrangementValue, issued: 0, issuedScreens: 0 }
  for (const d of defs) if (d.atStart && !d.stages) win = openScreen(win, catalog, d.id, {}).win
  return win.screens.length > 0 ? win : openScreen(win, catalog, stagesDefOf(catalog), {}).win
}

// ステージを並べるスクリーンの定義の id（機能台帳に無ければ NO_SCREEN_DEF）
export const stagesDefOf = (catalog: CoreCatalog): string =>
  [...catalog.screens.values()].find(d => d.stages)?.id ?? NO_SCREEN_DEF

// スクリーンを 1 枚開いてカレントにする（ステージを並べるスクリーンなら、ステージ 1 つの並びを持たせ、ブックを渡せばそれを開く）。開いた 1 枚の id も返す
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

// 開いているスクリーン id に渡した値を props に替える（スクリーンは積まず、その 1 枚の中身だけ替える。無いスクリーンなら何もしない）
export function withScreenProps(win: WindowState, id: string, props: unknown): WindowState {
  if (!win.screens.some(s => s.id === id)) return win
  return { ...win, screens: win.screens.map(s => (s.id === id ? { ...s, props } : s)) }
}

// カレントスクリーン（キーが効く先。いつも 1 枚で、最後にカレントにした物）
export function currentScreen(win: Pick<WindowState, "screens" | "order">): OpenedScreen {
  const id = win.order[win.order.length - 1]
  return win.screens.find(s => s.id === id) ?? fail("E117", { index: String(id) })
}

// いちばん最近カレントにした、種類 kind のスクリーン（stages はステージを並べるスクリーン、plain はそうでないスクリーン。無ければ undefined）
function recent(win: Pick<WindowState, "screens" | "order">, kind: "stages" | "plain"): OpenedScreen | undefined {
  for (let i = win.order.length - 1; i >= 0; i--) {
    const s = win.screens.find(x => x.id === win.order[i])
    if (s && holdsStages(s) === (kind === "stages")) return s
  }
  return undefined
}

// いちばん最近カレントにした、ステージを並べるスクリーン（ほかのスクリーンがカレントの間も、残っている物。1 枚も無ければ undefined）
export const recentBookScreen = (win: Pick<WindowState, "screens" | "order">): BookScreen | undefined =>
  recent(win, "stages") as BookScreen | undefined

// いちばん最近カレントにした、ステージを並べないスクリーン（無ければ undefined）
export const recentPlainScreen = (win: Pick<WindowState, "screens" | "order">): OpenedScreen | undefined =>
  recent(win, "plain")

// いちばん最近カレントにしたブックスクリーンの中（ステージの並び）。ブックスクリーンが 1 枚も無い窓では呼ばない（E117）
export function screenOf(win: Pick<WindowState, "screens" | "order">): Workspace {
  return (recentBookScreen(win) ?? fail("E117", { index: "none" })).stages
}

// いちばん最近カレントにしたブックスクリーンに操作をかける。ブックスクリーンが無ければ・変わらなければ同じ窓を返す
export function mapScreen(win: WindowState, change: (ws: Workspace) => Workspace): WindowState {
  const was = recentBookScreen(win)
  if (!was) return win
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

// スクリーン id を閉じる。最初から開いているスクリーン（定義が atStart を名乗る）の最後の 1 枚と、窓の最後の 1 枚は閉じない（同じ窓を返す）。
// カレントスクリーンを閉じたら、その 1 つ前にカレントだった物がカレントになる
export function closeScreen(win: WindowState, catalog: CoreCatalog, id: string): WindowState {
  const target = win.screens.find(s => s.id === id)
  if (!target || win.screens.length === 1) return win
  const only = win.screens.filter(s => s.def === target.def).length === 1
  if (only && catalog.screens.get(target.def)?.atStart) return win
  return { ...win, screens: win.screens.filter(s => s.id !== id), order: win.order.filter(x => x !== id) }
}

// 書庫が変わったときの窓（books はブックの一覧、library はページとフォルダの表。before は変わる前の一覧）: ブックスクリーンごとにステージを合わせ（workspace の followLibrary）、
// ステージが 1 つも残らないブックスクリーンは閉じる（窓の最後の 1 枚なら、何も開いていないステージ 1 つで残す）
export function followLibraryIn(
  win: WindowState,
  catalog: CoreCatalog,
  books: Readonly<Record<string, Book>>,
  library: Library,
  before?: Readonly<Record<string, Book>>,
): WindowState {
  let next = win
  const put = (id: string, ws: Workspace): WindowState => ({
    ...next,
    screens: next.screens.map(x => (x.id === id && x.stages !== ws ? { ...x, stages: ws } : x)),
  })
  for (const s of win.screens) {
    if (!s.stages) continue
    const ws = followLibrary(catalog, s.stages, books, library, before)
    if (ws === s.stages) continue
    if (ws !== NO_STAGES_LEFT) next = put(s.id, ws)
    else {
      const closed = closeScreen(next, catalog, s.id)
      next = closed === next ? put(s.id, emptied(s.stages)) : closed
    }
  }
  return next
}

// スクリーン screen のステージの並び（左から。何かを開いているか付き。ステージを並べないスクリーンなら空）
export const stageListOf = (screen: Pick<OpenedScreen, "stages">): readonly StageListed[] =>
  screen.stages?.stages.map(st => ({ id: st.id, opened: st.opened !== null })) ?? NO_STAGE_LIST
export interface StageListed {
  id: string
  opened: boolean // 何かを開いているか
}
const NO_STAGE_LIST: readonly StageListed[] = []

// スクリーン screen のカレントのステージの id（ステージを並べないスクリーンなら null）
export const currentStageOf = (screen: Pick<OpenedScreen, "stages">): string | null => screen.stages?.current ?? null

// 開いたままにする枚数（定義の maxOpen）を超えたスクリーンを閉じる（カレントにしたのが古い物から。超えていなければ同じ窓を返す）
export function withinLimits(win: WindowState, catalog: CoreCatalog): WindowState {
  let next = win
  for (const d of catalog.screens.values())
    if (d.maxOpen !== undefined)
      for (const id of overLimit(next, d.id, d.maxOpen)) next = closeScreen(next, catalog, id)
  return next
}

// 定義 def のスクリーンを max 枚まで開いたままにするとき、閉じる物（カレントにしたのが古い順に、超えた枚数だけ。超えなければ空）
export function overLimit(win: Pick<WindowState, "screens" | "order">, def: string, max: number): readonly string[] {
  const opened = win.order.filter(id => win.screens.some(s => s.id === id && s.def === def))
  return opened.slice(0, Math.max(0, opened.length - max))
}

// ステージエントリ book（ブックか、ブックの外のページの id）をステージに開いているブックスクリーン（いくつも在れば、いちばん最近カレントにした物。無ければ undefined）
export function bookScreenShowing(win: Pick<WindowState, "screens" | "order">, book: string): BookScreen | undefined {
  for (let i = win.order.length - 1; i >= 0; i--) {
    const s = win.screens.find(x => x.id === win.order[i])
    if (s && holdsStages(s) && s.stages.stages.some(st => st.opened?.outermost.id === book)) return s
  }
  return undefined
}

// ブック book を窓に出した窓と、出したステージの id: book を開いているブックスクリーンが在れば、それをカレントスクリーンにする
// （book を開いているステージをカレントに。カレントのステージが開いていれば、それ）。無ければ、新しいブックスクリーンで開き、開いたままにする枚数を超えた分を閉じる
export function shownBook(win: WindowState, catalog: CoreCatalog, book: Book): { win: WindowState; stage: string } {
  return shown(win, catalog, book.id, s => openBook(catalog, s, book))
}

// ブックの外のページ page を窓に出した窓と、出したステージの id（出し方は shownBook と同じ）
export function shownOutsidePage(
  win: WindowState,
  catalog: CoreCatalog,
  page: ItemPage,
): { win: WindowState; stage: string } {
  return shown(win, catalog, page.id, s => openOutsidePage(catalog, s, page))
}

// ステージエントリ entry を窓に出す（open は、何も開いていないステージにそれを開く）
function shown(
  win: WindowState,
  catalog: CoreCatalog,
  entry: string,
  open: (s: Stage) => Stage,
): { win: WindowState; stage: string } {
  const showing = bookScreenShowing(win, entry)
  if (!showing) {
    const opened = openScreen(win, catalog, stagesDefOf(catalog), {})
    const stage = opened.win.screens.find(s => s.id === opened.id)?.stages?.current ?? ""
    return {
      win: withinLimits(
        mapScreenOfStage(opened.win, stage, ws => mapStage(ws, stage, open)),
        catalog,
      ),
      stage,
    }
  }
  const stages = showing.stages.stages.filter(st => st.opened?.outermost.id === entry)
  const stage = (stages.find(st => st.id === showing.stages.current) ?? stages[0])?.id ?? ""
  return {
    win: makeCurrent(
      mapScreenOfStage(win, stage, ws => focus(ws, stage)),
      showing.id,
    ),
    stage,
  }
}

// 次のステージの番号を振る（窓で一意）
export function issueStage(win: WindowState): { win: WindowState; id: string } {
  const issued = win.issued + 1
  return { win: { ...win, issued }, id: `s${issued}` }
}

// AI に見せる、カレントスクリーンの種類
export const currentKindOf = (win: Pick<WindowState, "screens" | "order">): CurrentKind =>
  holdsStages(currentScreen(win)) ? "book-screen" : "control-center"

// カレントスクリーンがブックスクリーン（ステージを並べるスクリーン）か。ステージのキーと、ステージでの操作が効くのは、この間
export const bookScreenCurrent = (win: Pick<WindowState, "screens" | "order">): boolean =>
  currentKindOf(win) === "book-screen"

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

// ステージ stage を並べているブックスクリーンの中（ステージの並び。そのステージが無ければ、いちばん最近カレントにしたブックスクリーンの中）
export function workspaceOf(win: Pick<WindowState, "screens" | "order">, stage: string): Workspace {
  return screenOfStage(win, stage)?.stages ?? screenOf(win)
}

// 見えているスクリーンの id（スクリーンアレンジメントが答える。描いているスクリーンで、スクロールで画面の外にある物も含む）。
// 機能台帳に無いアレンジメントなら、カレントスクリーンだけ。開いていない id は除く
export function shownScreens(catalog: CoreCatalog, win: WindowState): readonly string[] {
  const def = catalog.screenArrangements.get(win.arrangement)
  if (!def) return [currentScreen(win).id]
  return def.shown(win.screens, win.order, win.arrangementValue).filter(id => win.screens.some(s => s.id === id))
}

// 見えているブックスクリーン（開いた順）
export function shownBookScreens(catalog: CoreCatalog, win: WindowState): readonly BookScreen[] {
  const shown = shownScreens(catalog, win)
  return win.screens.filter((s): s is BookScreen => holdsStages(s) && shown.includes(s.id))
}

// スクリーンアレンジメントを定義 def と値 value に替える（値を渡さなければ、定義の初めの値。機能台帳に無い定義・値が定義の形に合わない・今と同じなら同じ窓を返す）
export function setArrangement(win: WindowState, catalog: CoreCatalog, def: string, value?: unknown): WindowState {
  const found = catalog.screenArrangements.get(def)
  if (!found) return win
  const given = value === undefined ? found.value?.initial : value
  const fits = found.value
    ? found.value.schema.safeParse(given)
    : { success: true as const, data: NO_ARRANGEMENT_VALUE }
  if (!fits.success) return win
  if (win.arrangement === def && sameData(win.arrangementValue, fits.data)) return win
  return { ...win, arrangement: def, arrangementValue: arrangementValueOf(found, fits.data) }
}
