// 窓から常駐に知らせる物（窓が見ているもの viewOf・利用者が直している物 editLocksOf と recordLocksOf）と、
// 常駐が頼んだブックを窓に出すこと（showIn）。読むのは store の状態とインスタンス（viewOf は台帳も）

import type { z } from "zod"
import type { CoreCatalog } from "../core/core-catalog"
import type { Stage } from "../core/stage"
import { currentKindOf, recentBookScreen, screenOfStage, shownScreens } from "../core/window"
import { currentStage, MAX_STAGES } from "../core/workspace"
import { NO_STAGE } from "../store/dialogs"
import type { MatomezuInstance, MatomezuState } from "../store/state"
import type { ShowSchema } from "./server-schemas"

const openedOf = (stage: Stage) => {
  const opened = stage.opened
  return {
    book: opened?.outermost.kind === "book" ? opened.outermost.id : null,
    page: opened && "page" in opened ? (opened.page ?? null) : null,
    mode: stage.mode.kind,
  }
}

// 窓が見ているもの。current はカレントスクリーンの種類（ステージを並べるスクリーンなら book-screen、そうでなければ plain-screen）。
// book・page・mode（編集か印刷プレビューか）・selection は、いちばん最近カレントにしたブックスクリーンの、カレントのステージのもの（何も開いていなければ book は null）。
// そのブックスクリーンが見えているスクリーンでなければ、それらを hidden に分けて添える（見えていない物として、常駐は開いたことにしない）。
// ブックスクリーンが 1 枚も無ければ、bookScreen が NO_BOOK_SCREEN
export const NO_BOOK_SCREEN = "none"
export function viewOf(catalog: CoreCatalog, state: MatomezuState) {
  const current = currentKindOf(state.window)
  const book = recentBookScreen(state.window)
  if (!book) return { current, bookScreen: NO_BOOK_SCREEN }
  const ws = book.stages
  const stage = currentStage(ws)
  const screen = {
    ...openedOf(stage),
    selection: stage.selection,
    stage: stage.id,
    stages: ws.stages.map(s => ({ id: s.id, ...openedOf(s) })),
    canSplit: ws.stages.length < MAX_STAGES,
  }
  // そのブックスクリーンが見えていなければ、見えていない物として分ける
  return shownScreens(catalog, state.window).includes(book.id) ? { current, ...screen } : { current, hidden: screen }
}

// 利用者が直している物（useEditLock）を、ページかブックの id → その中の物の id の並びにまとめたもの（常駐はこれを変える AI のアクションを断る）
export const editLocksOf = (state: MatomezuState): Record<string, string[]> =>
  groupLocks(state, l => ("within" in l ? l.within : undefined))

// 利用者が直しているレコード（useRecordEditLock）を、対象の種類の id → レコードの id の並びにまとめたもの（常駐はこれを変える AI のアクションを断る）
export const recordLocksOf = (state: MatomezuState): Record<string, string[]> =>
  groupLocks(state, l => ("subject" in l ? l.subject : undefined))

// 利用者が直している物を、keyOf が答えた id ごとに、直している物の id の並び（重なりを除く）にまとめる（答えない物は入れない）
function groupLocks(
  state: MatomezuState,
  keyOf: (lock: MatomezuState["editLocks"][string]) => string | undefined,
): Record<string, string[]> {
  const locks: Record<string, string[]> = {}
  for (const l of Object.values(state.editLocks)) {
    const key = keyOf(l)
    if (key === undefined) continue
    const now = locks[key] ?? []
    locks[key] = [...now, ...l.ids.filter(id => !now.includes(id))]
  }
  return locks
}

// 常駐が頼んだブックを出す。ステージも split も言わなければ、窓に出す（showBook: もう開いていればカレントスクリーンにし、無ければ新しいブックスクリーン）。
// ステージを言えばそのステージに、split なら分けて右にできたステージに出す。mode が print-preview なら、印刷プレビューで出す
export function showIn(instance: MatomezuInstance, show: z.infer<typeof ShowSchema>) {
  const { actions, state } = instance
  const stage = show.stage === undefined && !show.split ? shownStage(instance, show) : placedStage(instance, show)
  if (stage === undefined) return
  const book = state.getState().books[show.book]
  if (show.mode === "print-preview" && book) actions.openPrintPreview(stage)
}

// ブックを窓に出して、出したステージを答える
function shownStage({ actions }: MatomezuInstance, show: z.infer<typeof ShowSchema>): string | undefined {
  const stage = actions.showBookStage(show.book, show.page)
  return stage === NO_STAGE ? undefined : stage
}

// ブックを、言われたステージ（split なら、分けて右にできたステージ）に出して、出したステージを答える
function placedStage({ actions, state }: MatomezuInstance, show: z.infer<typeof ShowSchema>): string | undefined {
  let stage = show.stage ?? recentBookScreen(state.getState().window)?.stages.current
  if (stage === undefined) return undefined
  if (show.split) {
    const before = (screenOfStage(state.getState().window, stage)?.stages.stages ?? []).map(s => s.id)
    const from = stage
    actions.split(from)
    const added = screenOfStage(state.getState().window, from)?.stages.stages.find(s => !before.includes(s.id))
    if (!added) return undefined
    stage = added.id
  }
  const to = stage
  actions.openBook(to, show.book)
  if (show.page) actions.openPage(to, show.page)
  return to
}
