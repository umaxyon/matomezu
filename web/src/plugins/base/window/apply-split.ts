// 上下に分けた並びの変わりを行う（useScreenSplit の applySplit と、base のコマンドが通る、ただ 1 つの道）と、ブックを分けて窓に出す（showBookSplit）
import { screenOfStage, type WindowState } from "../../../core/window"
import type { Actions } from "../../../store/actions"
import { NO_STAGE } from "../../../store/dialogs"
import { ONE_SCREEN } from "./one-screen"
import { bookSplitWay, planOpen, SPLIT_ROWS, type SplitPlan, shownSplit } from "./split"

// 並びの変わり plan を行う（useScreenSplit と base のコマンドが通る、ただ 1 つの道）: 閉じると決めた物を閉じ、カレントスクリーンにする物をカレントにしてから、並べ方を替える
// （並べ方を替えたときに土台が窓の上限で閉じる物を、カレントにする物を見えている物として決めるため）
export function applySplitFrom(
  actions: Pick<Actions, "closeScreen" | "setScreenArrangement" | "makeScreenCurrent">,
  plan: SplitPlan,
): void {
  for (const id of plan.closing ?? []) actions.closeScreen(id)
  if (plan.current !== undefined) actions.makeScreenCurrent(plan.current)
  if (plan.screens.length >= 2) actions.setScreenArrangement(SPLIT_ROWS.id, { screens: plan.screens })
  else actions.setScreenArrangement(ONE_SCREEN.id)
}

// ブック book（page を名指せばそのページ）を窓に出し、出したブックスクリーンを、スクリーン here を起点に上下に分けた並びに入れる（max 枚まで。入れ方は bookSplitWay）。
// 窓が低い（tall でない）ときは、分けずに窓いっぱいに出す。出したブックスクリーンがもう並びに在れば、並べ直さずに flash で光らせる。
// 「分割で開く」の、フック（useScreenSplit）とコマンドが通るただ 1 つの道。readWindow は窓の今の値（出した後の値も）を読む
export function showBookSplit(o: {
  actions: Pick<Actions, "showBook" | "showBookStage" | "closeScreen" | "setScreenArrangement" | "makeScreenCurrent">
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
  if (now.includes(added)) {
    o.flash(added)
    return
  }
  applySplitFrom(o.actions, planOpen(now, o.here, added, how, o.max))
}
