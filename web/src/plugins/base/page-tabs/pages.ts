// 次のページに選べる紙と向きと、次のページの題名の案（ページを足す・消すのは土台の core/book.ts）

import type { PagedBook } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import { ORIENTATIONS, type Orientation } from "../../../core/def/paper"
import { fail } from "../../../core/errors"
import { type Lang, translate } from "../../../core/i18n/i18n"
import type { PaperChoice, PaperRule } from "../../../core/paper"
import type { Page } from "../../../core/schema/book"
import { kit } from "../kit"

function pagesRule(catalog: CoreCatalog, book: PagedBook) {
  const rule = bookType(catalog, book.type).pages
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

export function paperChoices(catalog: CoreCatalog, book: PagedBook): PaperOptions {
  return choosablePapers(pagesRule(catalog, book).paper, book.pages)
}

// 選べるものに入るか
export function canChoose(options: PaperOptions, choice: PaperChoice): boolean {
  return options.papers.includes(choice.paper) && options.orientations.includes(choice.orientation)
}

// 次のページの紙の既定（規定の既定を選べなければ、選べるものの最初）
export function defaultPaper(catalog: CoreCatalog, book: PagedBook): PaperChoice {
  const rule = pagesRule(catalog, book).paper
  const { papers, orientations } = paperChoices(catalog, book)
  return {
    paper: papers.includes(rule.default) ? rule.default : (papers[0] ?? rule.default),
    orientation: orientations.includes(rule.orientation) ? rule.orientation : (orientations[0] ?? rule.orientation),
  }
}

// 次のページの題名の案
export function nextPageTitle(catalog: CoreCatalog, book: PagedBook, lang: Lang): string {
  return translate(catalog.messages, lang, kit.message("Page {n}"), { n: book.pages.length + 1 })
}
