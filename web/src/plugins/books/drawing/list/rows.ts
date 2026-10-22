// リストの行の操作（データを書き換えず、新しい値を返す）。リストは図面のページに置いたアイテムで、行は children に順に並ぶ
import type { BookOf } from "../../../../core/schema/book"
import type { DrawingPage } from "../placed"
import { LIST, type ListRow } from "."
import type { PlacedList } from "./placed"

type Drawing = BookOf<"drawing">

export const rowsOf = (list: PlacedList): readonly ListRow[] => list.children ?? []

// ページのリスト list（無いか、リストでなければ null）
export function findList(book: Drawing, pageId: string, list: string): { page: DrawingPage; list: PlacedList } | null {
  const page = book.pages.find(p => p.id === pageId)
  const found = page?.items?.find(i => i.id === list)
  return page && found?.item === LIST.id ? { page, list: found } : null
}

// ページのリストを next に置き換えたブック
export function withList(book: Drawing, page: DrawingPage, next: PlacedList): Drawing {
  const items = (page.items ?? []).map(i => (i.id === next.id ? next : i))
  return { ...book, pages: book.pages.map(p => (p.id === page.id ? { ...page, items } : p)) }
}
