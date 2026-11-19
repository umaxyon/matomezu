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
import { type Actions, SCREEN_REFUSED } from "../../../store/store"
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

// 書庫を開く: ブックスクリーンから呼べば、その下半分に書庫のスクリーンを出す（選ぶと、そのブックスクリーンのカレントのステージのブックを替える。
// 窓が低ければ、分けて並べる窓の決まりが書庫だけを窓いっぱいに見せる）。ほか（コントロールセンターなど）から呼べば、窓いっぱいに出す。開いていれば、新しく開かずにそれを使う
export const LIBRARY_OPEN = kit.defineScreenCommand({
  id: "library-open",
  title: "Open library",
  run: (ctx, a) => {
    const store = storeActionsOf(a)
    const screens = screensOf(ctx)
    const value = arrangementValueIn(ctx)
    const opened = screens.find(s => s.def === LIBRARY_SCREEN.id)?.id
    const library = opened ?? store.openScreenId(LIBRARY_SCREEN.id, {})
    if (library === SCREEN_REFUSED) return
    if (!ctx.screen.stages) {
      store.setScreenArrangement(ONE_SCREEN.id)
      store.makeScreenCurrent(library)
      return
    }
    const book = calledScreenIdOf(ctx)
    // 前の並び（コントロールセンターとチケットなど）は behind に覚え、書庫を閉じたら戻す
    const before = splitOf(screens, value).filter(id => id !== library && id !== book)
    store.setScreenArrangement(SPLIT_ROWS.id, { screens: [book, library], behind: before })
    store.makeScreenCurrent(library)
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

type Arranged = Pick<OpenScreen, "id" | "stages" | "vacant" | "stage">

// 書庫のスクリーン library から開く先のステージ: 上下に並んでいるブックスクリーンの何も開いていないステージ（「画面を分割」で足した物）、無ければそのカレントのステージ。
// 並んでいなければ NO_STAGE（新しいブックスクリーンに開く）
export function stageBeside(
  screens: readonly Pick<Arranged, "id" | "vacant" | "stage">[],
  value: unknown,
  library: string,
): string {
  const rows = splitOf(screens, value)
  if (!rows.includes(library)) return NO_STAGE
  const vacant = vacantStageBeside(screens, value, library)
  if (vacant !== NO_STAGE) return vacant
  for (const id of rows) {
    const stage = id === library ? null : screens.find(s => s.id === id)?.stage
    if (stage) return stage
  }
  return NO_STAGE
}

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
