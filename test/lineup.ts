// テストで使う、ブックとページの手本を組み立てる関数。ブックの並び（lineup）とページの形（kind・type）は、ここで 1 か所に決める
// （テストごとに形を手で書かない。形が変わったら、ここだけを直す）
import type { PageTypeId } from "../web/src/core/catalog"
import type { AnyPage, Book, FolderEntry, LineupEntry, PageOf } from "../web/src/core/schema/book"

export const DRAWING = "@matomezu/drawing:drawing"
export const FLOWCHART = "@matomezu/flowchart:flowchart"
export const TREE = "@matomezu/tree:tree"
export const DIR = "@matomezu/dir:dir"
export const MARKDOWN = "@matomezu/markdown:markdown"
export const SLIDE = "@matomezu/slide-book:slide"

// タイプ type のページ（id・題・紙は、書かなければ手本の値。rest に、アイテム・設定・タイプのフィールドなどを書く）
export function testPage<T extends PageTypeId>(
  type: T,
  id = "p1",
  rest: Partial<Omit<PageOf<T>, "kind" | "type" | "id">> = {},
): PageOf<T> {
  return {
    kind: "page",
    id,
    type,
    title: "ページ 1",
    paper: "@matomezu/base:a4",
    orientation: "landscape",
    ...rest,
  } as PageOf<T>
}

// 図面のページ（いちばん多く使う手本）
export const drawingPage = (id = "p1", rest: Partial<Omit<PageOf<typeof DRAWING>, "kind" | "type" | "id">> = {}) =>
  testPage(DRAWING, id, rest)

// タイプ type のページだけを入れるフォルダ
export function testFolder(id: string, title: string, type: PageTypeId, ...pages: AnyPage[]): FolderEntry {
  return { kind: "folder", id, title, pageType: type, lineup: pages }
}

// 並び entries のブック（rest に、ロック・ゴミ箱に入れた時刻・ブックの設定を書く）
export function testBook(
  id: string,
  title: string,
  entries: readonly LineupEntry[] = [drawingPage()],
  rest: Partial<Omit<Book, "id" | "title" | "lineup">> = {},
): Book {
  return { id, title, lineup: entries, ...rest }
}
