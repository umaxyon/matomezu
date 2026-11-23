// 上下に分けた並びの変わりを行う（useScreenSplit の applySplit と、状態を読めない base のコマンドが通る、ただ 1 つの道）と、ブックを分けて窓に出す（showBookSplit）
import { type OpenedScreen, screenOfStage, type WindowState } from "../../../core/window"
import type { Actions } from "../../../store/actions"
import { NO_STAGE } from "../../../store/dialogs"
import { ONE_SCREEN } from "./one-screen"
import { behindOf, bookSplitWay, planOpen, SPLIT_ROWS, type SplitPlan, shownSplit } from "./split"

// 並びの変わり plan を行う（useScreenSplit の applySplit の中身。状態を読めないコマンドからも呼ぶ）: screens は変わる前に開いているスクリーン、value は変わる前の上下に分ける値（分けていなければ undefined）。
// openAfter は、外れた物を閉じたあとに開いているスクリーン（渡さなければ、閉じた物がみな閉じたとみなす）
export function applySplitFrom(
  actions: Pick<Actions, "closeScreen" | "setScreenArrangement">,
  screens: readonly { id: string; stages?: unknown }[], // stages は、ステージを並べるスクリーンなら真
  value: unknown,
  plan: SplitPlan,
  openAfter?: () => readonly Pick<OpenedScreen, "id">[],
): void {
  const was = behindOf(screens, value)
  const staged = new Set(screens.filter(s => s.stages).map(s => s.id))
  const closing = plan.leaving.filter(id => !staged.has(id))
  for (const id of closing) actions.closeScreen(id)
  const open = openAfter?.() ?? screens.filter(s => !closing.includes(s.id))
  const kept = closing.filter(id => open.some(s => s.id === id))
  const behind = [...kept, ...was].filter(
    (id, i, list) => list.indexOf(id) === i && !plan.screens.includes(id) && open.some(s => s.id === id),
  )
  if (plan.screens.length >= 2) actions.setScreenArrangement(SPLIT_ROWS.id, { screens: plan.screens, behind })
  else actions.setScreenArrangement(ONE_SCREEN.id)
}

// ブック book（page を名指せばそのページ）を窓に出し、出したブックスクリーンを、スクリーン here を起点に上下に分けた並びに入れる（max 枚まで。入れ方は bookSplitWay）。
// 窓が低い（tall でない）ときは、分けずに窓いっぱいに出す。出したブックスクリーンがもう並びに在れば、並べ直さずに flash で光らせる。
// 「分割で開く」の、フック（useScreenSplit）とコマンドが通るただ 1 つの道。readWindow は窓の今の値（出した後の値も）を読む
export function showBookSplit(o: {
  actions: Pick<Actions, "showBook" | "showBookStage" | "closeScreen" | "setScreenArrangement">
  readWindow: () => WindowState
  here: string
  keepHere: boolean
  max: number
  tall: boolean
  flash: (screen: string) => void
  book: string
  page: string | undefined
}): void {
  if (!o.tall) {
    o.actions.showBook(o.book, o.page)
    return
  }
  // 出したブックスクリーンがカレントになると、並びに入る前は「分けて見せていない」と読めるので、並びは出す前の物を使う
  const was = o.readWindow()
  const before = shownSplit(was.screens, was.order, { id: was.arrangement, value: was.arrangementValue })
  const how = bookSplitWay(before.includes(o.here), before.indexOf(o.here), o.keepHere)
  const stage = o.actions.showBookStage(o.book, o.page)
  if (stage === NO_STAGE) return
  // 出すときに上限を超えたブックスクリーンが閉じることがあるので、出したあとの窓に残っている物だけにする
  const win = o.readWindow()
  const added = screenOfStage(win, stage)?.id
  if (added === undefined) return
  const now = before.filter(id => win.screens.some(s => s.id === id))
  if (now.includes(added)) return o.flash(added)
  const value = win.arrangement === SPLIT_ROWS.id ? win.arrangementValue : undefined
  applySplitFrom(o.actions, win.screens, value, planOpen(now, o.here, added, how, o.max), () => o.readWindow().screens)
}
