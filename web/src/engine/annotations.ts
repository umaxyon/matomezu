// アノテーションの計算: 残したアノテーションの確かめ・AI に見せる並びと 1 行・プラグインを外したときと期限で除く物。
// 台帳アセンブルの結果（Assembled）は、呼ぶたびに引数で受ける

import { annotationBriefs, annotationsForAi, checkAnnotations, restoreAnnotations, unexpired } from "../core/annotation"
import { pagesOf, readablePage, restoreBooks } from "../core/book"
import type { CoreCatalog } from "../core/core-catalog"
import { splitId } from "../core/names"
import type { ItemPage } from "../core/placed"
import { restoreSettings } from "../core/settings"
import { warningText } from "../core/warnings"
import type { Assembled } from "../store/plugin"

// ステージエントリ（ブックか、ブックの外のページ・バインダ）と、そのページごとのアノテーション（ページの id → 並び）の組（常駐が渡す）
type Annotated = { annotations: Readonly<Record<string, unknown>> } & (
  | { kind: "book"; book: unknown }
  | { kind: "page"; page: unknown }
  | { kind: "binder"; pages: readonly unknown[] }
)

// 組 p のステージエントリのページ（ブックなら並びの全部、ブックの外のページならその 1 枚、ブックの外のバインダなら中のページのうち読める物）。読めなければ null
function pagesOfAnnotated(catalog: CoreCatalog, p: Annotated): readonly ItemPage[] | null {
  if (p.kind === "book") {
    const [book] = restoreBooks(catalog, [p.book])
    return book ? pagesOf(book) : null
  }
  const read = (page: unknown) =>
    typeof page === "object" && page !== null ? readablePage(catalog, page, p.kind === "page") : undefined
  const pages = (p.kind === "binder" ? p.pages : [p.page]).map(read).filter(page => page !== undefined)
  return pages.length > 0 ? (pages as ItemPage[]) : null
}

// engine.ts の matomezuCheckAnnotations の中身
// 答えは、warning の有るページの id → その 1 行ずつ
export function checkAnnotationLines(of: Assembled, pairs: string): string {
  const catalog = of.catalog.core
  const lines: Record<string, string[]> = {}
  for (const p of JSON.parse(pairs) as Annotated[])
    for (const page of pagesOfAnnotated(catalog, p) ?? []) {
      const found = checkAnnotations(catalog, page, restoreAnnotations(p.annotations[page.id])).map(warningText)
      if (found.length > 0) lines[page.id] = found
    }
  return JSON.stringify(lines)
}

// engine.ts の matomezuAiAnnotations の中身
export function aiAnnotationsOf(of: Assembled, pairs: string): string {
  const catalog = of.catalog.core
  const out = (JSON.parse(pairs) as Annotated[]).map(p => {
    const pages = pagesOfAnnotated(catalog, p)
    return pages
      ? pages.flatMap(page => annotationsForAi(catalog, page, restoreAnnotations(p.annotations[page.id])))
      : Object.entries(p.annotations).flatMap(([page, list]) =>
          restoreAnnotations(list).map(a => ({ ...a, page, awaits: false })),
        )
  })
  return JSON.stringify(out)
}

// engine.ts の matomezuAiBriefs の中身
export function aiBriefsOf(of: Assembled, pairs: string): string {
  const catalog = of.catalog.core
  const out = (JSON.parse(pairs) as Annotated[]).map(p =>
    Object.fromEntries(
      (pagesOfAnnotated(catalog, p) ?? []).map(page => [
        page.id,
        annotationBriefs(catalog, page, restoreAnnotations(p.annotations[page.id])),
      ]),
    ),
  )
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
