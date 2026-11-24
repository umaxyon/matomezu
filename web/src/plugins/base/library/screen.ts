// 書庫のスクリーン（書庫の画面だけを見せる、ステージを並べないスクリーン）と、それを窓いっぱいに出すコマンド「書庫を開く」と、書庫のスクリーンを閉じる・広げる操作。
// 開く先は、置かれた所で決める（渡す値は無い）: ブックスクリーンと上下に並んでいれば、そのブックスクリーンの空のステージ（vacantStageBeside）、並んでいなければ新しいブックスクリーン。
// 書庫のスクリーンを閉じる・広げる道（帯のボタン・書庫のスクリーンの外の操作・「書庫を開く」・選んで開いたあと）は、どれもここの関数を通り、ステージを分けて足した空のステージを閉じる

import { z } from "zod"
import { UNREADABLE_ID } from "../../../core/folders"
import { type Actions, SCREEN_REFUSED } from "../../../store/actions"
import {
  arrangementValueIn,
  type CommandActions,
  calledScreenIdOf,
  type OpenScreen,
  resetPluginStateAtOf,
  type ScreenCommandContext,
  screensOf,
  storeActionsOf,
  updatePluginStateAtOf,
} from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { kit } from "../kit"
import { hasOpenedPage } from "../utils/opened-page"
import { expandLowerRow, leaveLowerRow, openInLowerRow, stageAboveLower } from "../window/lower-row"
import { splitOf } from "../window/split"
import { outsidePagePlaceOf } from "./outline"
import { LIBRARY_APPEARANCE, LIBRARY_FOLDER, LIBRARY_PICKED, LIBRARY_QUERY } from "./state"

export const LIBRARY_SCREEN = kit.defineScreen({
  id: "library-screen",
  title: "Library",
  aiDescription:
    "The library alone: the folder tree and the contents of the open folder. Below a book screen (opened with Open library from it, or by splitting its stages), a book picked there opens in that book screen: in the empty stage the split added, else in place of the current stage's book. Over the whole window, it opens in a new book screen.",
  props: z.strictObject({}),
  libraryAppearances: [LIBRARY_APPEARANCE.id],
  maxOpen: 1,
})

// 書庫を開く: ブックスクリーンから呼べば、その下半分に書庫のスクリーンを出す（選ぶと、そのブックスクリーンのカレントのステージのブックを替える。
// 窓が低ければ、分けて並べる窓の決まりが書庫のスクリーンだけを窓いっぱいに見せる）。ほか（コントロールセンターなど）から呼べば、窓いっぱいに出す。開いていれば、新しく開かずにそれを使う
export const LIBRARY_OPEN = kit.defineScreenCommand({
  id: "library-open",
  title: "Open library",
  run: (ctx, a) => {
    openLibrary(ctx, a)
  },
  when: () => true,
})

// 読めない物のフォルダを開く: 書庫を開き（書庫を開くと同じ所に出す）、右の枠に読めない物のフォルダを出す（ツリーに出す設定がオフでも開く。検索していればやめ、選んでいる行は外す）。
// 読めない物が移ったときの知らせのダイアログの［見る］が呼ぶ
export const LIBRARY_UNREADABLE_OPEN = kit.defineScreenCommand({
  id: "library-unreadable-open",
  title: "Open the unreadable folder",
  run: (ctx, a) => {
    const library = openLibrary(ctx, a)
    if (library === SCREEN_REFUSED) return
    // 検索をやめ、選んでいる行も外して、読めない物のフォルダを出す
    const write = updatePluginStateAtOf(a)
    write(library, LIBRARY_FOLDER, () => UNREADABLE_ID)
    const reset = resetPluginStateAtOf(a)
    reset(library, LIBRARY_PICKED)
    reset(library, LIBRARY_QUERY)
  },
  when: () => true,
})

// 開いているブックの外のページの置き場所を、書庫で開く: 書庫を開き（書庫を開くと同じ所に出す。ステージは開いたまま）、右の枠にそのページの入っているフォルダを出す
// （検索していればやめ、選んでいる行は外す）。ステージの下の行の、置き場所の表示が呼ぶ
export const LIBRARY_PLACE_OPEN = kit.defineCommand({
  id: "library-place-open",
  title: "Open the folder in the library",
  run: (ctx, a) => {
    const holder = hasOpenedPage(ctx) ? outsidePagePlaceOf(ctx.folders, ctx.page.id).at(-1) : undefined
    if (holder === undefined) return
    const library = openLibrary(ctx, a)
    if (library === SCREEN_REFUSED) return
    const write = updatePluginStateAtOf(a)
    write(library, LIBRARY_FOLDER, () => holder)
    const reset = resetPluginStateAtOf(a)
    reset(library, LIBRARY_PICKED)
    reset(library, LIBRARY_QUERY)
  },
  when: ctx => hasOpenedPage(ctx) && outsidePagePlaceOf(ctx.folders, ctx.page.id).length > 0,
})

// 書庫のスクリーンを出して、その id を返す（出せなければ SCREEN_REFUSED）。開いていれば、新しく開かずにそれを使う
const openLibrary = (ctx: ScreenCommandContext, a: CommandActions): string | typeof SCREEN_REFUSED =>
  openInLowerRow(ctx, a, LIBRARY_SCREEN.id)

// 書庫のスクリーンを閉じる（帯の閉じるボタン・書庫のスクリーンの外の操作。書庫の画面の中で Esc。コントロールセンターの書庫の画面からは出さない）
export const LIBRARY_SCREEN_CLOSE = kit.defineScreenCommand({
  id: "library-screen-close",
  title: "Close library",
  run: (ctx, a) => closeLibrary(storeActionsOf(a), screensOf(ctx), arrangementValueIn(ctx), calledScreenIdOf(ctx)),
  when: ctx => ctx.screen.def === LIBRARY_SCREEN.id,
})

// ブックスクリーンと上下に並べている書庫のスクリーンを、窓いっぱいに広げる（帯の広げるボタン）
export const LIBRARY_SCREEN_EXPAND = kit.defineScreenCommand({
  id: "library-screen-expand",
  title: "Expand library",
  run: (ctx, a) => expandLibrary(storeActionsOf(a), screensOf(ctx), arrangementValueIn(ctx), calledScreenIdOf(ctx)),
  when: ctx => ctx.screen.def === LIBRARY_SCREEN.id,
})

type Arranged = Pick<OpenScreen, "id" | "stages" | "stageList" | "currentStage">

// ステージを分けている間の、何も開いていないステージの id（分けていなければ空。「画面を分割」で足して、まだ何も開いていない物）
const vacantOf = (s: Pick<OpenScreen, "stageList">): readonly string[] =>
  s.stageList.length >= 2 ? s.stageList.filter(st => !st.opened).map(st => st.id) : []

// 書庫のスクリーン library から開く先のステージ: 上下に並んでいるブックスクリーンの何も開いていないステージ（「画面を分割」で足した物）、無ければそのカレントのステージ。
// 並んでいなければ NO_STAGE（新しいブックスクリーンに開く）
export function stageBeside(
  screens: readonly Pick<Arranged, "id" | "stageList" | "currentStage">[],
  value: unknown,
  library: string,
): string {
  const rows = splitOf(screens, value)
  if (!rows.includes(library)) return NO_STAGE
  const vacant = vacantStageBeside(screens, value, library)
  return vacant !== NO_STAGE ? vacant : stageAboveLower(screens, value, library)
}

// 書庫のスクリーン library と上下に並んでいるブックスクリーンの、何も開いていないステージ（ステージを分けて足した物）。並んでいない・空のステージが無ければ NO_STAGE。
// 書庫のスクリーンはいつも並びの下に置くので、並びの中を探せば上のブックスクリーンの物になる。screens は開いているスクリーン、value はスクリーンアレンジメントの値
export function vacantStageBeside(
  screens: readonly Pick<Arranged, "id" | "stageList">[],
  value: unknown,
  library: string,
): string {
  const rows = splitOf(screens, value)
  if (!rows.includes(library)) return NO_STAGE
  for (const id of rows) {
    const screen = screens.find(s => s.id === id)
    const vacant = screen && vacantOf(screen)[0]
    if (vacant !== undefined) return vacant
  }
  return NO_STAGE
}

type Store = Pick<Actions, "closeStage" | "closeScreen" | "setScreenArrangement" | "makeScreenCurrent">

// 書庫のスクリーン library を閉じる: 空のステージを閉じ、並びから外す（並びが 1 枚になれば、残った物を窓いっぱいに見せる）
export function closeLibrary(store: Store, screens: readonly Arranged[], value: unknown, library: string): void {
  const vacant = vacantStageBeside(screens, value, library)
  if (vacant !== NO_STAGE) store.closeStage(vacant)
  leaveLibrary(store, screens, value, library)
}

// 書庫のスクリーン library を閉じて並びから外す（ステージは閉じない。書庫のスクリーンから開いたあと、開いたステージを残して閉じるとき）
export const leaveLibrary = leaveLowerRow

// 書庫のスクリーン library を窓いっぱいに広げる（同じスクリーンのまま。空のステージは閉じ、並べていた物は開いたまま見えなくなる）
function expandLibrary(store: Store, screens: readonly Arranged[], value: unknown, library: string): void {
  const vacant = vacantStageBeside(screens, value, library)
  if (vacant !== NO_STAGE) store.closeStage(vacant)
  expandLowerRow(store, library)
}
