// ページを使っている所: ページの中の物（スクラップなど）が、ほかのページを指していること。書庫の全部のページを見るので常駐が引き、画面は頼んで答えを受ける（完全に消す前の確かめ）。
// ページの中の何がほかのページを指すかは、呼ぶ側が渡す関数 pointed が決める（スクラップは base の scrapUsersOf）

import type { CoreCatalog } from "./core-catalog"
import type { Folders } from "./folders"
import type { ItemPage } from "./placed"
import { inSight } from "./references"

// 頼んだページの id → それを使っているページの id の並び（使われていないページは載せない）。
// sure は、全部のページで答えられたか（答えられないページ〈タイプが機能台帳に無い・形が読めない〉があれば false で、一覧が足りないかもしれない）
export interface PageUsers {
  users: Readonly<Record<string, readonly string[]>>
  sure: boolean
}

// 書庫の行の全部（ページの行 pages とフォルダの行 folders。常駐が持つ生の行）から、ページ targets のそれぞれを使っている見える所のページ（pointed が、そのページの中の物が指すページの id を答える）。
// 使っているページのうち、ゴミ箱・読めない物のフォルダの中の物は数えない（一緒に消えるか、開けない）。バックヤードの中の物は数える
export function pageUsersIn(
  catalog: CoreCatalog,
  pages: readonly unknown[],
  folders: readonly unknown[],
  targets: readonly string[],
  pointed: (page: ItemPage) => readonly string[],
): PageUsers {
  const asked = new Set(targets)
  const table = Object.fromEntries(
    folders.flatMap(f => (isRow(f) && typeof f.id === "string" ? [[f.id, f]] : [])),
  ) as unknown as Folders
  const users: Record<string, string[]> = {}
  let sure = true
  for (const page of pages) {
    if (!isRow(page) || typeof page.id !== "string" || !inSight(table, page.id)) continue
    if (typeof page.type !== "string" || !catalog.pageTypes.has(page.type)) {
      sure = false
      continue
    }
    let to: readonly string[]
    try {
      to = pointed(page as unknown as ItemPage)
    } catch {
      sure = false
      continue
    }
    for (const target of new Set(to)) {
      if (!asked.has(target)) continue
      users[target] ??= []
      users[target].push(page.id)
    }
  }
  return { users, sure }
}

const isRow = (r: unknown): r is Record<string, unknown> => typeof r === "object" && r !== null
