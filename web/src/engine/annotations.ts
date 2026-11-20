// アノテーションの計算: 残したアノテーションの確かめ・AI に見せる並びと 1 行・プラグインを外したときと期限で除く物。
// 台帳アセンブルの結果（Assembled）は、呼ぶたびに引数で受ける

import { annotationBriefs, annotationsForAi, checkAnnotations, restoreAnnotations, unexpired } from "../core/annotation"
import { pagesOf, restoreBooks } from "../core/book"
import { splitId } from "../core/names"
import { restoreSettings } from "../core/settings"
import { warningText } from "../core/warnings"
import type { Assembled } from "../store/plugin"

// ブックと、そのページごとのアノテーション（ページの id → 並び）の組（常駐が渡す）
interface AnnotatedBook {
  book: unknown
  annotations: Readonly<Record<string, unknown>>
}

// engine.ts の matomezuCheckAnnotations の中身
export function checkAnnotationLines(of: Assembled, pairs: string): string {
  const catalog = of.catalog.core
  const lines = (JSON.parse(pairs) as AnnotatedBook[]).flatMap(p => {
    const [book] = restoreBooks(catalog, [p.book])
    return book
      ? pagesOf(book).flatMap(page =>
          checkAnnotations(catalog, book, page, restoreAnnotations(p.annotations[page.id])).map(warningText),
        )
      : []
  })
  return JSON.stringify(lines)
}

// engine.ts の matomezuAiAnnotations の中身
export function aiAnnotationsOf(of: Assembled, pairs: string): string {
  const catalog = of.catalog.core
  const out = (JSON.parse(pairs) as AnnotatedBook[]).map(p => {
    const [book] = restoreBooks(catalog, [p.book])
    return book
      ? pagesOf(book).flatMap(page => annotationsForAi(catalog, page, restoreAnnotations(p.annotations[page.id])))
      : Object.entries(p.annotations).flatMap(([page, list]) =>
          restoreAnnotations(list).map(a => ({ ...a, page, awaits: false })),
        )
  })
  return JSON.stringify(out)
}

// engine.ts の matomezuAiBriefs の中身
export function aiBriefsOf(of: Assembled, pairs: string): string {
  const catalog = of.catalog.core
  const out = (JSON.parse(pairs) as AnnotatedBook[]).map(p => {
    const [book] = restoreBooks(catalog, [p.book])
    return Object.fromEntries(
      (book ? pagesOf(book) : []).map(page => [
        page.id,
        annotationBriefs(catalog, page, restoreAnnotations(p.annotations[page.id])),
      ]),
    )
  })
  return JSON.stringify(out)
}

// engine.ts の matomezuAnnotationsWithout の中身
export function annotationsWithout(plugin: string, list: string): string {
  const all = restoreAnnotations(JSON.parse(list))
  const kept = all.filter(a => splitId(String(a.annotation)).owner !== plugin)
  return JSON.stringify({ annotations: kept, changed: kept.length !== all.length })
}

// engine.ts の matomezuUnexpired の中身
export function unexpiredOf(of: Assembled, list: string, settings: string, now: string, kept: string): string {
  const all = restoreAnnotations(JSON.parse(list))
  const live = unexpired(
    of.catalog.core,
    all,
    restoreSettings(JSON.parse(settings)),
    now,
    new Set(JSON.parse(kept) as string[]),
  )
  return JSON.stringify({ annotations: live, changed: live !== all })
}
