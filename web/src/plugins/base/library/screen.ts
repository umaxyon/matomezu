// 書庫のスクリーン（書庫の画面だけを見せる、ステージを並べないスクリーン）と、それを窓いっぱいに出すコマンド「書庫を開く」と、書庫のスクリーンを閉じる・広げる操作。
// 開く先は、置かれた所で決める（渡す値は無い）: ブックスクリーンと上下に並んでいれば、そのブックスクリーンの空のステージ（vacantStageBeside）、並んでいなければ新しいブックスクリーン。
// 書庫のスクリーンを閉じる・広げる道（帯のボタン・書庫の外の操作・「書庫を開く」・選んで開いたあと）は、どれもここの関数を通り、ステージを分けて足した空のステージを閉じる
import { z } from "zod"
import {
  arrangementValueIn,
  calledScreenIdOf,
  type OpenScreen,
  screensOf,
  storeActionsOf,
} from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import type { Actions } from "../../../store/store"
import { kit } from "../kit"
import { ONE_SCREEN } from "../window"
import { behindOf, planClose, SPLIT_ROWS, splitOf } from "../window/split"
import { LIBRARY_APPEARANCE } from "./state"

export const LIBRARY_SCREEN = kit.defineScreen({
  id: "library-screen",
  title: "Library",
  aiDescription:
    "The library alone: the folder tree and the contents of the open folder. Below a book screen whose stages are split, a book picked there opens in the empty stage; over the whole window, it opens in a new book screen.",
  props: z.strictObject({}),
  libraryAppearances: [LIBRARY_APPEARANCE.id],
  maxOpen: 1,
})

// 書庫のスクリーンを窓いっぱいに出す（開いていれば、それを前に出す。ブックスクリーンの下に出していれば、広げる）
export const LIBRARY_OPEN = kit.defineScreenCommand({
  id: "library-open",
  title: "Open library",
  run: (ctx, a) => {
    const store = storeActionsOf(a)
    const screens = screensOf(ctx)
    const opened = screens.find(s => s.def === LIBRARY_SCREEN.id)
    if (opened) return expandLibrary(store, screens, arrangementValueIn(ctx), opened.id)
    store.setScreenArrangement(ONE_SCREEN.id)
    store.openScreenId(LIBRARY_SCREEN.id, {})
  },
  when: () => true,
})

// 書庫のスクリーンを閉じる（帯の閉じるボタンと同じ。書庫の画面の中で Esc。コントロールセンターの書庫の画面からは出さない）
export const LIBRARY_SCREEN_CLOSE = kit.defineScreenCommand({
  id: "library-screen-close",
  title: "Close library",
  run: (ctx, a) => closeLibrary(storeActionsOf(a), screensOf(ctx), arrangementValueIn(ctx), calledScreenIdOf(ctx)),
  when: ctx => ctx.screen.def === LIBRARY_SCREEN.id,
})

type Arranged = Pick<OpenScreen, "id" | "stages" | "vacant">

// 書庫のスクリーン library と上下に並んでいるブックスクリーンの、何も開いていないステージ（ステージを分けて足した物）。並んでいない・空のステージが無ければ NO_STAGE。
// 書庫はいつも並びの下に置くので、並びの中を探せば上のブックスクリーンの物になる。screens は開いているスクリーン、value はスクリーンアレンジメントの値
export function vacantStageBeside(
  screens: readonly Pick<Arranged, "id" | "vacant">[],
  value: unknown,
  library: string,
): string {
  const rows = splitOf(screens, value)
  if (!rows.includes(library)) return NO_STAGE
  for (const id of rows) {
    const vacant = screens.find(s => s.id === id)?.vacant[0]
    if (vacant !== undefined) return vacant
  }
  return NO_STAGE
}

type Store = Pick<Actions, "closeStage" | "closeScreen" | "setScreenArrangement" | "makeScreenCurrent">

// 書庫のスクリーン library を閉じる: 空のステージを閉じ、並びから外す（残りがブックスクリーンだけなら、ステージを分ける前の並びに戻す）
export function closeLibrary(store: Store, screens: readonly Arranged[], value: unknown, library: string): void {
  const vacant = vacantStageBeside(screens, value, library)
  if (vacant !== NO_STAGE) store.closeStage(vacant)
  const rows = splitOf(screens, value)
  store.closeScreen(library)
  if (!rows.includes(library)) return
  const stages = screens.filter(s => s.stages).map(s => s.id)
  const next = planClose(rows, behindOf(screens, value), library, stages)
  if (next.screens.length >= 2) store.setScreenArrangement(SPLIT_ROWS.id, { screens: next.screens, behind: [] })
  else store.setScreenArrangement(ONE_SCREEN.id)
}

// 書庫のスクリーン library を窓いっぱいに広げる（同じスクリーンのまま。空のステージは閉じ、並べていたブックスクリーンは開いたまま後ろへ）
export function expandLibrary(store: Store, screens: readonly Arranged[], value: unknown, library: string): void {
  const vacant = vacantStageBeside(screens, value, library)
  if (vacant !== NO_STAGE) store.closeStage(vacant)
  store.setScreenArrangement(ONE_SCREEN.id)
  store.makeScreenCurrent(library)
}
