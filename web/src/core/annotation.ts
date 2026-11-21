// アノテーション: ページの中の物に結び付き、ページのデータとは別に残る物（種類は core/def/annotation.ts）。ページごとに並びで持つ。
// 結び付く物（アンカー）は、そのページの中の id を持つ物（ページそのものは含まない。ほかのページの物には結び付かない）。アンカーの物が全部無くなったアノテーションは残らない。
// 種類の期限（expiresAt）の過ぎたアノテーションも残らない（消すのは常駐で、画面はそれまで出さない）
import { z } from "zod"
import { briefLine } from "./brief"
import { type CoreCatalog, pageType } from "./core-catalog"
import { idsIn } from "./ids"
import { splitId } from "./names"
import type { ItemPage } from "./placed"
import type { Book } from "./schema/book"
import { type Settings, userSetting } from "./settings"
import { type Warning, warning } from "./warnings"

export const AnnotationSchema = z.object({
  id: z.string().min(1),
  annotation: z.string().min(1), // 種類の id
  anchors: z.tuple([z.string().min(1)], z.string().min(1)), // 結び付く物の id（1 つ以上）
  props: z.unknown(), // 種類ごとの形（種類の props で確かめる）
})
export type Annotation = z.output<typeof AnnotationSchema>

// 結び付く物の id の並び（1 つ以上）
export type Anchors = Annotation["anchors"]

// 並び ids を、結び付く物の id の並びにする（1 つも無ければ null）
export function anchorsOf(ids: readonly string[]): Anchors | null {
  const [first, ...rest] = ids
  return first === undefined ? null : [first, ...rest]
}

// アクションの対象 annotations が受けて返すもの: ページ（読むだけで、アクションは変えない）と、そのアノテーションの並び
export interface PageAnnotations {
  page: ItemPage
  annotations: readonly Annotation[]
}

// ページごとのアノテーション（ページの id → 並び。1 つも無いページは持たなくてよい）
export type Annotations = Readonly<Record<string, readonly Annotation[]>>

// 残しておいたアノテーションの並び（外から来る値。並びでなければ無いものとし、中の 1 つずつは確かめずに持つ。確かめるのは checkAnnotations）
export const restoreAnnotations = (saved: unknown): readonly Annotation[] =>
  Array.isArray(saved) ? (saved as Annotation[]) : []

// ページの中の、アンカーにできる物の id
export function anchorIds({ id: _page, ...content }: ItemPage): ReadonlySet<string> {
  return new Set(idsIn(content))
}

// ページ page に無い物の id をアンカーから外し、アンカーが全部無くなったアノテーションを消す（変わらなければ同じ並び）
export function prune(annotations: readonly Annotation[], page: ItemPage): readonly Annotation[] {
  if (annotations.length === 0) return annotations
  const ids = anchorIds(page)
  let changed = false
  const next = annotations.flatMap(a => {
    if (!Array.isArray(a.anchors)) return [a]
    const kept = a.anchors.filter(id => ids.has(id))
    if (kept.length === a.anchors.length) return [a]
    changed = true
    const anchors = anchorsOf(kept)
    return anchors ? [{ ...a, anchors }] : []
  })
  return changed ? next : annotations
}

// タイプ type のページで、種類 id のアノテーションを使えるか（種類が機能台帳にあり、タイプが外していない）
const annotationAllowed = (catalog: CoreCatalog, type: string, id: string): boolean =>
  catalog.annotations.has(id) && !(pageType(catalog, type).annotations?.without?.includes(id as never) ?? false)

// 1 つのアノテーションが決まりを守っているか: 形が合い、種類の形に合い、アンカーがどれもページ page の中（ids はその中の物の id）にあり、そのページのタイプが種類を使える
function fits(catalog: CoreCatalog, page: ItemPage, ids: ReadonlySet<string>, a: Annotation): boolean {
  if (!AnnotationSchema.safeParse(a).success) return false
  const def = catalog.annotations.get(a.annotation)
  if (!def?.props.safeParse(a.props).success) return false
  return annotationAllowed(catalog, page.type, a.annotation) && a.anchors.every(id => ids.has(id))
}

// アクションが返した並び after が決まりを守っているか: id が重ならず、前の並び before から足した・変えた物はどれも決まりを守る。
// 前からあって変えていない物は見ない（プラグインが外れて効かなくなった物があっても、ほかは変えられる）
export function annotationsSettle(
  catalog: CoreCatalog,
  page: ItemPage,
  before: readonly Annotation[],
  after: readonly Annotation[],
): boolean {
  if (new Set(after.map(a => a.id)).size !== after.length) return false
  const kept = new Set(before)
  const ids = anchorIds(page)
  return after.every(a => kept.has(a) || fits(catalog, page, ids, a))
}

// 残しておいたページ page（ブック book の中）のアノテーションを確かめる: 種類が機能台帳に無い物（W018）・形が合わない物（W019）を warning にする（データには手を付けない）
export function checkAnnotations(
  catalog: CoreCatalog,
  book: Pick<Book, "id" | "title">,
  page: ItemPage,
  annotations: readonly Annotation[],
): Warning[] {
  const ids = anchorIds(page)
  return annotations.flatMap(a => {
    const id = typeof a?.id === "string" ? a.id : ""
    const kind = typeof a?.annotation === "string" ? a.annotation : ""
    const params = { book: book.id, title: book.title, id, annotation: kind }
    const plugin = splitId(kind).owner ?? ""
    if (!catalog.annotations.has(kind)) return [warning("W018", plugin, params)]
    return fits(catalog, page, ids, a) ? [] : [warning("W019", plugin, params)]
  })
}

// AI に見せるアノテーション: 付いているページと、AI の応えを待っているか（種類の awaits）を添える
export interface AiAnnotation extends Annotation {
  page: string
  awaits: boolean
}

export function annotationsForAi(
  catalog: CoreCatalog,
  page: ItemPage,
  annotations: readonly Annotation[],
): AiAnnotation[] {
  const ids = anchorIds(page)
  return annotations.map(a => {
    const def = catalog.annotations.get(a.annotation)
    const awaits = def?.awaits !== undefined && fits(catalog, page, ids, a) && def.awaits(a.props)
    return { ...a, page: page.id, awaits }
  })
}

// AI に知らせる 1 行の長さの上限（字。コードポイントで数える）
const BRIEF_LIMIT = 40

// 待っている物を AI に知らせる 1 行（種類の aiBrief）: アノテーションの id → 1 行。改行と続く空白は 1 つの空白にし、上限を超えたら切って「…」と全体の字数を添える。
// 種類が aiBrief を持たない物・形が合わない物（props を種類に渡さない）・空の物は入れない
export function annotationBriefs(
  catalog: CoreCatalog,
  page: ItemPage,
  annotations: readonly Annotation[],
): Record<string, string> {
  const ids = anchorIds(page)
  const out: Record<string, string> = {}
  for (const a of annotations) {
    const def = catalog.annotations.get(a.annotation)
    if (def?.aiBrief === undefined || !fits(catalog, page, ids, a)) continue
    const line = briefLine(def.aiBrief(a.props), BRIEF_LIMIT)
    if (line !== "") out[a.id] = line
  }
  return out
}

// ページごとのアノテーション all に、変わったページの並び changed（performIn の annotations）を入れる。空の並びのページは持たない
export function withAnnotations(all: Annotations, changed: Annotations | undefined): Annotations {
  if (!changed) return all
  const next: Record<string, readonly Annotation[]> = { ...all }
  for (const [page, list] of Object.entries(changed)) {
    if (list.length > 0) next[page] = list
    else delete next[page]
  }
  return next
}

// 残しておいたページごとのアノテーション（外から来る値。ページの id → 並び）
export const restoreAllAnnotations = (saved: unknown): Annotations =>
  typeof saved === "object" && saved !== null && !Array.isArray(saved)
    ? Object.fromEntries(
        Object.entries(saved).flatMap(([page, list]) => {
          const restored = restoreAnnotations(list)
          return restored.length > 0 ? [[page, restored]] : []
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
