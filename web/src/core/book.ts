// ブックの操作（データを書き換えず、新しい値を返す）

import { ORIENTATIONS, type Orientation } from "./def/paper"
import { fail } from "./errors"
import type { Lang } from "./i18n/i18n"
import { translate } from "./i18n/i18n"
import { nextNumber } from "./ids"
import type { PaperChoice, PaperRule } from "./paper"
import { actionsOf } from "./perform"
import { type BookTypeId, bookType } from "./registry"
import type { Book, BookOf, Page } from "./schema/book"

export type PagedBook = Extract<Book, { pages: Page[] }>

// マスターのブック（1 冊だけ）
export const MASTER_BOOK: BookOf<"master"> = { type: "master", id: "master" }

export function hasPages(book: Book): book is PagedBook {
  return "pages" in book
}

// 画面に出すブックの名前。題名を持たないか空のブックは、タイプの名前で呼ぶ
export function bookTitle(book: Book, lang: Lang): string {
  return "title" in book && book.title.trim() !== "" ? book.title : translate(lang, bookType(book.type).title)
}

function pagesRule(book: PagedBook) {
  const rule = bookType(book.type as BookTypeId).pages
  if (!rule) return fail("E103", { type: book.type })
  return rule
}

// 次のページに選べる紙と向き。1 冊の紙をそろえる規定では、最初のページの紙と向きだけ
export interface PaperOptions {
  papers: readonly string[]
  orientations: readonly Orientation[]
}

// 規定の下で、次のページに選べる紙と向き
export function choosablePapers(rule: PaperRule, pages: readonly Page[]): PaperOptions {
  const first = pages[0]
  if (rule.perPage || !first) return { papers: rule.allowed, orientations: ORIENTATIONS }
  return { papers: [first.paper], orientations: [first.orientation] }
}

export function paperChoices(book: PagedBook): PaperOptions {
  return choosablePapers(pagesRule(book).paper, book.pages)
}

// 選べるものに入るか
export function canChoose(options: PaperOptions, choice: PaperChoice): boolean {
  return options.papers.includes(choice.paper) && options.orientations.includes(choice.orientation)
}

// 次のページの紙の既定（規定の既定を選べなければ、選べるものの最初）
export function defaultPaper(book: PagedBook): PaperChoice {
  const rule = pagesRule(book).paper
  const { papers, orientations } = paperChoices(book)
  return {
    paper: papers.includes(rule.default) ? rule.default : (papers[0] ?? rule.default),
    orientation: orientations.includes(rule.orientation) ? rule.orientation : (orientations[0] ?? rule.orientation),
  }
}

// タブの横に、ページを足すボタンを出すか（タイプが出すと決め、ブックで page.add が使える）
export function addsFromTabs(book: Book): boolean {
  return hasPages(book) && pagesRule(book).addFromTabs && actionsOf(book).includes("page.add")
}

// 次のページの題名の案
export function nextPageTitle(book: PagedBook, lang: Lang): string {
  return translate(lang, "ページ {n}", { n: book.pages.length + 1 })
}

export function addPage<B extends PagedBook>(book: B, init: { title: string } & PaperChoice): { book: B; page: Page } {
  const n = nextNumber(
    "p",
    book.pages.map(p => p.id),
  )
  const page = { id: `p${n}`, ...init }
  return { book: { ...book, pages: [...book.pages, page] }, page }
}
