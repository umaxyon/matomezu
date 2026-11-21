// 窓から常駐に知らせる物（窓が見ているもの viewOf・利用者が直している物 editLocksOf と recordLocksOf）と、
// 常駐が頼んだ物（ブックか、ブックの外のページ）を窓に出すこと（showIn）。読むのは store の状態とインスタンス（viewOf は台帳も）

import type { z } from "zod"
import type { CoreCatalog } from "../core/core-catalog"
import type { Stage } from "../core/stage"
import { currentKindOf, recentBookScreen, screenOfStage, shownScreens } from "../core/window"
import { currentStage, MAX_STAGES } from "../core/workspace"
import type { OpenTo } from "../store/actions"
import { NO_STAGE } from "../store/dialogs"
import type { MatomezuInstance, MatomezuState } from "../store/state"
import type { ShowSchema } from "./server-schemas"

// ステージ stage が開いている物: entry はステージエントリ（ブックか、ブックの外のページ。何も開いていなければ無い）、page はページの id（ブックの外のページなら、そのページ）
const openedOf = (stage: Stage) => {
  const opened = stage.opened
  return {
    ...(opened ? { entry: { kind: opened.outermost.kind, id: opened.outermost.id } } : {}),
    page: opened && "page" in opened ? (opened.page ?? null) : null,
    mode: stage.mode.kind,
  }
}

// 窓が見ているもの。current はカレントスクリーンの種類（ステージを並べるスクリーンなら book-screen、そうでなければ plain-screen）。
// entry・page・mode（編集か印刷プレビューか）・selection は、いちばん最近カレントにしたブックスクリーンの、カレントのステージのもの（何も開いていなければ entry は無い）。
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

// 常駐が頼んだ物（ブックか、ブックの外のページ）を出す。ステージも split も言わなければ、窓に出す（もう開いていればカレントスクリーンにし、無ければ新しいブックスクリーン）。
// ステージを言えばそのステージに、split なら分けて右にできたステージに出す。ブックで mode が print-preview なら、印刷プレビューで出す
export function showIn(instance: MatomezuInstance, show: z.infer<typeof ShowSchema>) {
  const { actions, state } = instance
  const to: OpenTo =
    show.to === "page"
      ? { to: "page", page: show.page }
      : { to: "book", book: show.book, ...(show.page === undefined ? {} : { page: show.page }) }
  const stage = show.stage === undefined && !show.split ? actions.openToStage(to) : placedStage(instance, show, to)
  if (stage === NO_STAGE) return
  if (show.to === "book" && show.mode === "print-preview" && state.getState().books[show.book])
    actions.openPrintPreview(stage)
}

// 開く物 to を、言われたステージ（split なら、分けて右にできたステージ）に出して、出したステージを答える（出せなければ NO_STAGE）
function placedStage({ actions, state }: MatomezuInstance, show: z.infer<typeof ShowSchema>, to: OpenTo): string {
  const from = show.stage ?? recentBookScreen(state.getState().window)?.stages.current
  if (from === undefined) return NO_STAGE
  if (!show.split) return actions.openToStage(to, from)
  const before = (screenOfStage(state.getState().window, from)?.stages.stages ?? []).map(s => s.id)
  actions.split(from)
  const added = screenOfStage(state.getState().window, from)?.stages.stages.find(s => !before.includes(s.id))
  return added ? actions.openToStage(to, added.id) : NO_STAGE
}
