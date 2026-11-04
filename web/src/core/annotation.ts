// アノテーション: ブックの物に結び付き、ブックのデータとは別に残る物（種類は core/def/annotation.ts）。ブックごとに並びで持つ。
// 結び付く物（アンカー）は、ブックのページの中の id を持つ物（ページそのものは含まない）。アンカーの物が全部無くなったアノテーションは残らない
import { z } from "zod"
import { bookType, type CoreCatalog } from "./core-catalog"
import { idsIn } from "./ids"
import { splitId } from "./names"
import type { Book } from "./schema/book"
import { type Warning, warning } from "./warnings"

export const AnnotationSchema = z.object({
  id: z.string().min(1),
  annotation: z.string().min(1), // 種類の id
  anchors: z.array(z.string().min(1)).min(1), // 結び付く物の id
  props: z.unknown(), // 種類ごとの形（種類の props で確かめる）
})
export type Annotation = z.output<typeof AnnotationSchema>

// アクションの対象 annotations が受けて返すもの: ブック（読むだけで、アクションは変えない）と、そのアノテーションの並び
export interface BookAnnotations {
  book: Book
  annotations: readonly Annotation[]
}

// ブックごとのアノテーション（ブックの id → 並び。1 つも無いブックは持たなくてよい）
export type Annotations = Readonly<Record<string, readonly Annotation[]>>

// 残しておいたアノテーションの並び（外から来る値。並びでなければ無いものとし、中の 1 つずつは確かめずに持つ。確かめるのは checkAnnotations）
export const restoreAnnotations = (saved: unknown): readonly Annotation[] =>
  Array.isArray(saved) ? (saved as Annotation[]) : []

// ブックの中の、アンカーにできる物の id
export function anchorIds(book: Book): ReadonlySet<string> {
  const pages = "pages" in book ? (book.pages as readonly { id: string }[]) : []
  return new Set(pages.flatMap(({ id: _page, ...content }) => idsIn(content)))
}

// ブック book に無い物の id をアンカーから外し、アンカーが全部無くなったアノテーションを消す（変わらなければ同じ並び）
export function prune(annotations: readonly Annotation[], book: Book): readonly Annotation[] {
  if (annotations.length === 0) return annotations
  const ids = anchorIds(book)
  let changed = false
  const next = annotations.flatMap(a => {
    const anchors = Array.isArray(a.anchors) ? a.anchors.filter(id => ids.has(id)) : []
    if (anchors.length === (Array.isArray(a.anchors) ? a.anchors.length : -1)) return [a]
    changed = true
    return anchors.length > 0 ? [{ ...a, anchors }] : []
  })
  return changed ? next : annotations
}

// タイプ type のブックで、種類 id のアノテーションを使えるか（種類が機能台帳にあり、タイプが外していない）
const annotationAllowed = (catalog: CoreCatalog, type: string, id: string): boolean =>
  catalog.annotations.has(id) && !(bookType(catalog, type).annotations?.without?.includes(id as never) ?? false)

// 1 つのアノテーションが決まりを守っているか: 形が合い、ブックのタイプが種類を使え、種類の形に合い、アンカーがどれもブックにある
function fits(catalog: CoreCatalog, book: Book, ids: ReadonlySet<string>, a: Annotation): boolean {
  if (!AnnotationSchema.safeParse(a).success || !annotationAllowed(catalog, book.type, a.annotation)) return false
  const def = catalog.annotations.get(a.annotation)
  if (!def) return false
  return def.props.safeParse(a.props).success && a.anchors.every(id => ids.has(id))
}

// アクションが返した並び after が決まりを守っているか: id が重ならず、前の並び before から足した・変えた物はどれも決まりを守る。
// 前からあって変えていない物は見ない（プラグインが外れて効かなくなった物があっても、ほかは変えられる）
export function annotationsSettle(
  catalog: CoreCatalog,
  book: Book,
  before: readonly Annotation[],
  after: readonly Annotation[],
): boolean {
  if (new Set(after.map(a => a.id)).size !== after.length) return false
  const kept = new Set(before)
  const ids = anchorIds(book)
  return after.every(a => kept.has(a) || fits(catalog, book, ids, a))
}

// 残しておいたアノテーションを確かめる: 種類が機能台帳に無い物（W018）・形が合わない物（W019）を warning にする（データには手を付けない）
export function checkAnnotations(catalog: CoreCatalog, book: Book, annotations: readonly Annotation[]): Warning[] {
  const ids = anchorIds(book)
  return annotations.flatMap(a => {
    const id = typeof a?.id === "string" ? a.id : ""
    const kind = typeof a?.annotation === "string" ? a.annotation : ""
    const params = { book: book.id, title: book.title, id, annotation: kind }
    const plugin = splitId(kind).owner ?? ""
    if (!catalog.annotations.has(kind)) return [warning("W018", plugin, params)]
    return fits(catalog, book, ids, a) ? [] : [warning("W019", plugin, params)]
  })
}

// AI に見せるアノテーション: 結び付く物の最後（anchors の最後）のあるページと、AI の応えを待っているか（種類の awaits）を添える
export interface AiAnnotation extends Annotation {
  page: string | null // 結び付く物の最後（anchors の最後）があるページ（ページの無いブックや、見つからなければ null）
  awaits: boolean
}

export function annotationsForAi(catalog: CoreCatalog, book: Book, annotations: readonly Annotation[]): AiAnnotation[] {
  const pages = "pages" in book ? (book.pages as readonly { id: string }[]) : []
  const pageOf = new Map(pages.flatMap(({ id: page, ...content }) => idsIn(content).map(id => [id, page] as const)))
  const ids = anchorIds(book)
  return annotations.map(a => {
    const def = catalog.annotations.get(a.annotation)
    const awaits = def?.awaits !== undefined && fits(catalog, book, ids, a) && def.awaits(a.props)
    return { ...a, page: pageOf.get(a.anchors.at(-1) ?? "") ?? null, awaits }
  })
}

// ブックごとのアノテーション all に、変わったブックの並び changed（performIn の annotations）を入れる。空の並びのブックは持たない
export function withAnnotations(all: Annotations, changed: Annotations | undefined): Annotations {
  if (!changed) return all
  const next: Record<string, readonly Annotation[]> = { ...all }
  for (const [book, list] of Object.entries(changed)) {
    if (list.length > 0) next[book] = list
    else delete next[book]
  }
  return next
}

// 残しておいたブックごとのアノテーション（外から来る値。ブックの id → 並び）
export const restoreAllAnnotations = (saved: unknown): Annotations =>
  typeof saved === "object" && saved !== null && !Array.isArray(saved)
    ? Object.fromEntries(
        Object.entries(saved).flatMap(([book, list]) => {
          const restored = restoreAnnotations(list)
          return restored.length > 0 ? [[book, restored]] : []
        }),
      )
    : {}
