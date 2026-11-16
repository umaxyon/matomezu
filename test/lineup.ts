// テストで使う、ブックとページの手本を組み立てる関数。ブックの並び（lineup）とページの形（kind・type）は、ここで 1 か所に決める
// （テストごとに形を手で書かない。形が変わったら、ここだけを直す）
import type { PageTypeId } from "../web/src/core/catalog"
import type { AnyPage, BinderEntry, Book, LineupEntry, PageOf } from "../web/src/core/schema/book"

export const DRAWING = "@matomezu/drawing:drawing"
export const FLOWCHART = "@matomezu/flowchart:flowchart"
export const TREE = "@matomezu/tree:tree"
export const DIR = "@matomezu/dir:dir"
export const MARKDOWN = "@matomezu/markdown:markdown"
export const SLIDE = "@matomezu/slide-book:slide"

// ページの手本に書けるフィールド。アイテムは、機能台帳に無い物や一部のフィールドだけの物も置けるよう、形を問わない（読めるかはテストが確かめる）
type PageRest<T extends PageTypeId> = Partial<Omit<PageOf<T>, "kind" | "type" | "id" | "items">> & {
  items?: readonly object[]
}

// タイプ type のページ（id・題・紙は、書かなければ手本の値。rest に、アイテム・設定・タイプのフィールドなどを書く）
export function testPage<T extends PageTypeId>(type: T, id = "p1", rest: PageRest<T> = {}): PageOf<T> {
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
export const drawingPage = (id = "p1", rest: PageRest<typeof DRAWING> = {}) => testPage(DRAWING, id, rest)

// ページ page に、形だけの並び slide を持たせたページ（ページの型は slide を持たないので、テストが置く形をここで足す）
export function withSlide<P extends AnyPage>(page: P, slide: readonly object[]): P {
  return { ...page, slide }
}

// タイプ type のページだけを入れるバインダ
export function testBinder(id: string, title: string, type: PageTypeId, ...pages: AnyPage[]): BinderEntry {
  return { kind: "binder", id, title, pageType: type, lineup: pages }
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
