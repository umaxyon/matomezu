// ブックスクリーンの下の段に出すスクリーン（書庫のスクリーン・郵便箱のスクリーン）の、開く・並びから外す・窓いっぱいに広げる並びの計算。
// ブックスクリーンから開けば上下に分けて（SPLIT_ROWS）その下に出し、前の並びは behind に覚えて、外したら戻す。ステージの無いスクリーンから開けば、1 枚ずつ（ONE_SCREEN）で窓いっぱいに出す。
// ステージの扱い（ステージを分けて足した空のステージを閉じるなど）は、出すスクリーンの側が持つ
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
import { applySplitFrom } from "./apply-split"
import { ONE_SCREEN } from "./one-screen"
import { behindOf, planClose, planExpand, SPLIT_ROWS, splitOf } from "./split"

type Arranged = Pick<OpenScreen, "id" | "stages" | "stageList" | "currentStage">
type Store = Pick<Actions, "closeScreen" | "setScreenArrangement" | "makeScreenCurrent">

// スクリーンの定義 def のスクリーンを、呼んだスクリーンの下の段に出して、その id を返す（出せなければ SCREEN_REFUSED）。開いていれば、新しく開かずにそれを使う。
// 呼んだのがステージの無いスクリーンなら、窓いっぱいに出す
export function openBelowBook(
  ctx: ScreenCommandContext,
  a: CommandActions,
  def: string,
): string | typeof SCREEN_REFUSED {
  const store = storeActionsOf(a)
  const screens = screensOf(ctx)
  const opened = screens.find(s => s.def === def)?.id
  const below = opened ?? store.openScreenId(def, {})
  if (below === SCREEN_REFUSED) return below
  if (!ctx.screen.stages) {
    store.setScreenArrangement(ONE_SCREEN.id)
    store.makeScreenCurrent(below)
    return below
  }
  const book = calledScreenIdOf(ctx)
  // 前の並び（コントロールセンターとチケットなど）は behind に覚え、下の段のスクリーンを閉じたら戻す
  const before = splitOf(screens, arrangementValueIn(ctx)).filter(id => id !== below && id !== book)
  store.setScreenArrangement(SPLIT_ROWS.id, { screens: [book, below], behind: before })
  store.makeScreenCurrent(below)
  return below
}

// 下の段のスクリーン below を閉じて並びから外す（残りがブックスクリーンだけなら、その前の並びに戻す）。並んでいなければ閉じるだけ
export function leaveBelowBook(store: Store, screens: readonly Arranged[], value: unknown, below: string): void {
  const rows = splitOf(screens, value)
  if (!rows.includes(below)) {
    store.closeScreen(below)
    return
  }
  const stages = screens.filter(s => s.stages).map(s => s.id)
  applySplitFrom(store, screens, value, planClose(rows, behindOf(screens, value), below, stages))
}

// 下の段のスクリーン below を窓いっぱいに広げる（同じスクリーンのまま。並べていたブックスクリーンは開いたまま後ろへ）
export function expandBelowBook(store: Store, screens: readonly Arranged[], value: unknown, below: string): void {
  applySplitFrom(store, screens, value, planExpand(splitOf(screens, value), below))
  store.makeScreenCurrent(below)
}

// 下の段のスクリーン below と上下に並んでいるブックスクリーンの、カレントのステージ（並んでいなければ NO_STAGE）
export function bookStageAbove(
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
