// 下の行に出すスクリーン（書庫のスクリーン・郵便箱のスクリーン）の、開く・閉じる・窓いっぱいに広げる・上の行の物をブックに替える並びの計算。
// 呼んだスクリーンを上、出すスクリーンを下に上下に分けて（SPLIT_ROWS）並べる。上の行には、ブックスクリーンもほかのスクリーンも置ける。
// 下の行の物から呼べば、下の行を入れ替える。ステージの扱い（ステージを分けて足した空のステージを閉じるなど）は、出すスクリーンの側が持つ

import type { ScreenId } from "../../../core/catalog"
import { screenOfStage, type WindowState } from "../../../core/window"
import type { Actions } from "../../../store/actions"
import { SCREEN_REFUSED } from "../../../store/actions"
import {
  arrangementValueIn,
  type CommandActions,
  calledScreenIdOf,
  type OpenScreen,
  type ScreenCommandContext,
  screensOf,
  storeActionsOf,
} from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { kit } from "../kit"
import { applySplitFrom } from "./apply-split"
import { planAt, planClose, planExpand, splitOf } from "./split"
import { viewInsideOf } from "./views-inside"

// 下の行に出すスクリーンの定義（ここから呼べば、上の行の物はそのままに、下の行を入れ替える）
const LOWER_ROW_SCREENS: readonly string[] = [kit.name("library-screen"), kit.name("mailbox-screen")]

type Arranged = Pick<OpenScreen, "id" | "currentStage">
type Store = Pick<Actions, "closeScreen" | "setScreenArrangement" | "makeScreenCurrent">

// 下の行に出すスクリーンの上に置く物: 呼んだスクリーン called。それが下の行に出すスクリーンなら、並びのその上の物（並んでいなければ undefined。窓いっぱいに出す）
function upperOf(
  screens: readonly Pick<OpenScreen, "id" | "def">[],
  value: unknown,
  called: string,
): string | undefined {
  const def = screens.find(s => s.id === called)?.def
  if (def === undefined || !LOWER_ROW_SCREENS.includes(def)) return called
  const rows = splitOf(screens, value)
  const at = rows.indexOf(called)
  return at > 0 ? rows[at - 1] : undefined
}

// スクリーンの定義 def のスクリーンを、呼んだスクリーンの下の行に出して、その id を返す（出せなければ SCREEN_REFUSED）。開いていれば、新しく開かずにそれを使う。
// 呼んだのが下の行の物なら、下の行を入れ替える（前の物は開いたまま見えなくなる）。
// 呼んだスクリーンが def の画面を中に描いている（定義の viewsInside。コントロールセンター）なら、何も開かずに、呼んだスクリーンの id を返す
export function openInLowerRow(
  ctx: ScreenCommandContext,
  a: CommandActions,
  def: ScreenId,
): string | typeof SCREEN_REFUSED {
  if (viewInsideOf(ctx.catalog, ctx.screen.def, def) !== undefined) return calledScreenIdOf(ctx)
  const store = storeActionsOf(a)
  const screens = screensOf(ctx)
  const below = screens.find(s => s.def === def)?.id ?? store.openScreenId(def, {})
  if (below === SCREEN_REFUSED) return below
  const upper = upperOf(screens, arrangementValueIn(ctx), calledScreenIdOf(ctx))
  applySplitFrom(store, { screens: upper === undefined || upper === below ? [] : [upper, below], current: below })
  return below
}

// 下の行のスクリーン below を閉じる（並びが 1 枚になれば、残った物を窓いっぱいに見せる）
export function closeInLowerRow(
  store: Store,
  screens: readonly Pick<Arranged, "id">[],
  value: unknown,
  below: string,
): void {
  const rows = splitOf(screens, value)
  if (rows.includes(below)) applySplitFrom(store, planClose(rows, below))
  else store.closeScreen(below)
}

// 下の行のスクリーン below を窓いっぱいに広げる（同じスクリーンのまま。上の行の物は開いたまま見えなくなる）
export function expandLowerRow(store: Store, below: string): void {
  applySplitFrom(store, planExpand(below))
}

// 下の行のスクリーン below と上下に並んでいるブックスクリーンの、カレントのステージ（並んでいない・上の行がブックスクリーンでなければ NO_STAGE）
export function stageAboveLower(
  screens: readonly Pick<Arranged, "id" | "currentStage">[],
  value: unknown,
  below: string,
): string {
  const rows = splitOf(screens, value)
  if (!rows.includes(below)) return NO_STAGE
  for (const id of rows) {
    const stage = id === below ? NO_STAGE : (screens.find(s => s.id === id)?.currentStage ?? NO_STAGE)
    if (stage !== NO_STAGE) return stage
  }
  return NO_STAGE
}

// 下の行のスクリーン below から、ブック book を窓に出す（下の行の「開く」）: 上の行の物（ブックスクリーンでも、ほかのスクリーンでも）を、
// そのブックのブックスクリーン（開いていなければ新しく開く）に替え、替えた物は開いたまま見えなくなる。下の行はそのまま。
// 上下に並んでいなければ、窓に出すだけ。出したステージの id を返す（出せなければ NO_STAGE）
export function showBookInUpperRow(
  store: Pick<Actions, "showBookStage" | "closeScreen" | "setScreenArrangement" | "makeScreenCurrent">,
  readWindow: () => WindowState,
  below: string,
  book: string,
): string {
  const was = readWindow()
  const rows = splitOf(was.screens, was.arrangementValue)
  const upper = rows.find(id => id !== below)
  const stage = store.showBookStage(book)
  if (stage === NO_STAGE || upper === undefined || !rows.includes(below)) return stage
  const added = screenOfStage(readWindow(), stage)?.id
  if (added === undefined || added === upper) return stage
  applySplitFrom(store, planAt(rows, rows.indexOf(upper), added))
  return stage
}
