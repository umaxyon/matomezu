// 窓の状態。窓は、コントロールセンターかブックスクリーンのどちらかを前に出す（front）。
// ブックスクリーンは、見ているもの（workspace.ts のステージの並び）を持つ 1 つの画面で、窓はその並び（screens）を持つ。前に出せるのは 1 つ（screen の番号）。
// コントロールセンターを前に出している間も、後ろのブックスクリーンの中（ステージ・倍率・選択など）は残る。
// ステージの番号は窓で一意に振る（issued。どのブックスクリーンのステージでも、閉じたステージの番号も使い回さない）。
// 操作はデータを書き換えず、新しい値を返す（変わらなければ同じものを使い回す）

import type { CoreCatalog } from "./core-catalog"
import { fail } from "./errors"
import type { Book } from "./schema/book"
import { newWorkspace, type Workspace } from "./workspace"

// 窓が前に出している物
export type Front = "control-center" | "book-screen"

export interface WindowState {
  front: Front
  screens: readonly Workspace[] // ブックスクリーンの並び（1 つ以上）
  screen: number // 前に出せるブックスクリーンの番号（screens の中）
  issued: number // 最後に振ったステージの番号
}

// ブックスクリーン 1 つ（ステージ 1 つ。ブックを渡せばそれを開き、無ければ何も開かない）を前に出せる窓。front は前に出す物
export function newWindow(catalog: CoreCatalog, book: Book | null, front: Front = "book-screen"): WindowState {
  return { front, screens: [newWorkspace(catalog, book)], screen: 0, issued: 1 }
}

// 前に出せるブックスクリーン（コントロールセンターを前に出している間も、後ろに残っている物）
export function screenOf(win: Pick<WindowState, "screens" | "screen">): Workspace {
  return win.screens[win.screen] ?? fail("E117", { index: win.screen })
}

// 前に出せるブックスクリーンに操作をかける。変わらなければ同じ窓を返す
export function mapScreen(win: WindowState, change: (ws: Workspace) => Workspace): WindowState {
  const was = screenOf(win)
  const next = change(was)
  return next === was ? win : { ...win, screens: win.screens.map((s, i) => (i === win.screen ? next : s)) }
}

// 全部のブックスクリーンに操作をかける（ブックが変わったときなど、隠れているブックスクリーンも合わせる）。変わらなければ同じ窓を返す
export function mapScreens(win: WindowState, change: (ws: Workspace) => Workspace): WindowState {
  const screens = win.screens.map(change)
  return screens.every((s, i) => s === win.screens[i]) ? win : { ...win, screens }
}

// 前に出す物を替える
export function bringFront(win: WindowState, front: Front): WindowState {
  return win.front === front ? win : { ...win, front }
}

// 次のステージの番号を振る（窓で一意）
export function issueStage(win: WindowState): { win: WindowState; id: string } {
  const issued = win.issued + 1
  return { win: { ...win, issued }, id: `s${issued}` }
}

// ブックスクリーンが見えているか（前に出ているか）。コントロールセンターを前に出している間、後ろのブックスクリーンは見えていない
export const bookScreenVisible = (win: Pick<WindowState, "front">): boolean => win.front === "book-screen"
