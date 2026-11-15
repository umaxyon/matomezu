// アノテーション: ブックの物に結び付き、ブックのデータとは別に残る物（種類は core/def/annotation.ts）。ブックごとに並びで持つ。
// 結び付く物（アンカー）は、ブックのページの中の id を持つ物（ページそのものは含まない）。アンカーの物が全部無くなったアノテーションは残らない。
// 種類の期限（expiresAt）の過ぎたアノテーションも残らない（消すのは常駐で、画面はそれまで出さない）
import { z } from "zod"
import { pagesOf } from "./book"
import { briefLine } from "./brief"
import { type CoreCatalog, pageType } from "./core-catalog"
import { idsIn } from "./ids"
import { splitId } from "./names"
import type { Book } from "./schema/book"
import { type Settings, userSetting } from "./settings"
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
  return new Set(pagesOf(book).flatMap(({ id: _page, ...content }) => idsIn(content)))
}

// ブック book に無い物の id をアンカーから外し、アンカーが全部無くなったアノテーションを消す（変わらなければ同じ並び）
export function prune(annotations: readonly Annotation[], book: Book): readonly Annotation[] {
  if (annotations.length === 0) return annotations
  const ids = anchorIds(book)
  let changed = false
  const next = annotations.flatMap(a => {
    if (!Array.isArray(a.anchors)) return [a]
    const anchors = a.anchors.filter(id => ids.has(id))
    if (anchors.length === a.anchors.length) return [a]
    changed = true
    return anchors.length > 0 ? [{ ...a, anchors }] : []
  })
  return changed ? next : annotations
}

// タイプ type のページで、種類 id のアノテーションを使えるか（種類が機能台帳にあり、タイプが外していない）
const annotationAllowed = (catalog: CoreCatalog, type: string, id: string): boolean =>
  catalog.annotations.has(id) && !(pageType(catalog, type).annotations?.without?.includes(id as never) ?? false)

// ブックの中の、アンカーにできる物の id → その物があるページのタイプ
function anchorTypes(book: Book): ReadonlyMap<string, string> {
  return new Map(
    pagesOf(book).flatMap(({ id: _page, type, ...content }) => idsIn(content).map(id => [id, type] as const)),
  )
}

// 1 つのアノテーションが決まりを守っているか: 形が合い、種類の形に合い、アンカーがどれもブックにあり、アンカーのあるどのページのタイプも種類を使える
function fits(catalog: CoreCatalog, types: ReadonlyMap<string, string>, a: Annotation): boolean {
  if (!AnnotationSchema.safeParse(a).success) return false
  const def = catalog.annotations.get(a.annotation)
  if (!def || !def.props.safeParse(a.props).success) return false
  return a.anchors.every(id => {
    const type = types.get(id)
    return type !== undefined && annotationAllowed(catalog, type, a.annotation)
  })
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
  const types = anchorTypes(book)
  return after.every(a => kept.has(a) || fits(catalog, types, a))
}

// 残しておいたアノテーションを確かめる: 種類が機能台帳に無い物（W018）・形が合わない物（W019）を warning にする（データには手を付けない）
export function checkAnnotations(catalog: CoreCatalog, book: Book, annotations: readonly Annotation[]): Warning[] {
  const types = anchorTypes(book)
  return annotations.flatMap(a => {
    const id = typeof a?.id === "string" ? a.id : ""
    const kind = typeof a?.annotation === "string" ? a.annotation : ""
    const params = { book: book.id, title: book.title, id, annotation: kind }
    const plugin = splitId(kind).owner ?? ""
    if (!catalog.annotations.has(kind)) return [warning("W018", plugin, params)]
    return fits(catalog, types, a) ? [] : [warning("W019", plugin, params)]
  })
}

// AI に見せるアノテーション: 結び付く物の最後（anchors の最後）のあるページと、AI の応えを待っているか（種類の awaits）を添える
export interface AiAnnotation extends Annotation {
  page: string | null // 結び付く物の最後（anchors の最後）があるページ（ページの無いブックや、見つからなければ null）
  awaits: boolean
}

export function annotationsForAi(catalog: CoreCatalog, book: Book, annotations: readonly Annotation[]): AiAnnotation[] {
  const pageOf = new Map(
    pagesOf(book).flatMap(({ id: page, ...content }) => idsIn(content).map(id => [id, page] as const)),
  )
  const types = anchorTypes(book)
  return annotations.map(a => {
    const def = catalog.annotations.get(a.annotation)
    const awaits = def?.awaits !== undefined && fits(catalog, types, a) && def.awaits(a.props)
    return { ...a, page: pageOf.get(a.anchors.at(-1) ?? "") ?? null, awaits }
  })
}

// AI に知らせる 1 行の長さの上限（字。コードポイントで数える）
const BRIEF_LIMIT = 40

// 待っている物を AI に知らせる 1 行（種類の aiBrief）: アノテーションの id → 1 行。改行と続く空白は 1 つの空白にし、上限を超えたら切って「…」と全体の字数を添える。
// 種類が aiBrief を持たない物・形が合わない物（props を種類に渡さない）・空の物は入れない
export function annotationBriefs(
  catalog: CoreCatalog,
  book: Book,
  annotations: readonly Annotation[],
): Record<string, string> {
  const types = anchorTypes(book)
  const out: Record<string, string> = {}
  for (const a of annotations) {
    const def = catalog.annotations.get(a.annotation)
    if (def?.aiBrief === undefined || !fits(catalog, types, a)) continue
    const line = briefLine(def.aiBrief(a.props), BRIEF_LIMIT)
    if (line !== "") out[a.id] = line
  }
  return out
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

// 期限の過ぎていないアノテーション: 種類の期限（expiresAt）が時点 now より前の物を除く（kept の id の物は除かない。利用者が直している物など）。
// 除く物が無ければ同じ並び。時点は ISO の時刻の文字列で比べる
export function unexpired(
  catalog: CoreCatalog,
  annotations: readonly Annotation[],
  settings: Settings,
  now: string,
  kept: ReadonlySet<string> = new Set(),
): readonly Annotation[] {
  const setting = (id: string) => userSetting(catalog, settings, id)
  const live = annotations.filter(a => {
    if (kept.has(a.id)) return true
    const def = catalog.annotations.get(a.annotation)
    const parsed = def?.expiresAt ? def.props.safeParse(a.props) : undefined
    const at = parsed?.success ? def?.expiresAt?.(parsed.data, setting) : null
    return !at || at > now
  })
  return live.length === annotations.length ? annotations : live
}

// 利用者トリガートークのときに行うアクション（アクションの定義が runsWhenUserTalks で名乗る、アノテーションが対象の物）の id
export const talkActions = (catalog: CoreCatalog): string[] =>
  [...catalog.actions.values()].filter(a => a.runsWhenUserTalks && a.target === "annotations").map(a => a.id)
