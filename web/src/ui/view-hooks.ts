// プラグインの見た目が使うフック（matomezu/ui）: matomezu が渡すステージの id から、約束のものだけを引く。状態を丸ごとは見せない。
// データはブック・ページ・アイテム、ステージは読むだけの StageView、ほかに機能台帳と利用者の設定。データを変えるのは usePerform（アクション）だけ
import { useMemo } from "react"
import { pagedOf, withSettings } from "../core/book"
import type { ActionId, ItemId } from "../core/catalog"
import type { CoreCatalog } from "../core/core-catalog"
import type { Where } from "../core/def/action"
import type { Lang } from "../core/i18n/i18n"
import { deniedBy, inspect } from "../core/inspect"
import type { ArgsOf } from "../core/perform"
import { findShape, type ItemPage, type PlacedItem, type PlacedOf } from "../core/placed"
import type { Book } from "../core/schema/book"
import { type Settings, userSetting } from "../core/settings"
import { type StageView, stageView, toolOf } from "../core/workspace"
import type { Performed } from "../store/store"
import type { UiCatalog } from "./plugin"
import { useActions, useCatalog, useHome, useMatomezuState, useUiCatalog as useUi } from "./store-context"

// そのステージが開いているブック（何も開いていなければ null）
export function useBook(stage: string): Book | null {
  return useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? (s.books[o.book] ?? null) : null
  })
}

// そのステージが開いているページ（ページを持たないブック・ページを開いていなければ null）
export function usePage(stage: string): ItemPage | null {
  return useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    const book = o ? pagedOf(s.books[o.book]) : undefined
    return (book?.pages.find(p => p.id === o?.page) as ItemPage | undefined) ?? null
  })
}

// そのステージが開いているブックの、ページ page のアイテム item（どの深さの子の形も。無いか、id が Id のアイテムでなければ undefined）
export function useItem<Id extends ItemId>(
  stage: string,
  page: string,
  item: string,
  id?: Id,
): PlacedOf<Id> | undefined {
  return useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    const book = o ? pagedOf(s.books[o.book]) : undefined
    const p = book?.pages.find(p => p.id === page) as ItemPage | undefined
    // ページのアイテムか、どの深さの子の形も
    const found = p && (p.items?.find(i => i.id === item) ?? findShape(p, item)?.shape)
    return found && (id === undefined || found.item === id) ? (found as unknown as PlacedOf<Id>) : undefined
  })
}

// そのステージが開いているブックに、ダイアログの下書き（ブックの設定の項目の、まだ確定していない値）を重ねたブック。見せ方が描くのに使う
export function useShownBook(stage: string): Book | null {
  const book = useBook(stage)
  const preview = useMatomezuState(s => s.dialog?.preview ?? null)
  return useMemo(() => {
    if (!book || !preview || preview.book !== book.id || preview.item !== undefined || preview.page !== undefined)
      return book
    return withSettings(book, preview.props)
  }, [book, preview])
}

// そのステージが開いているページに、ダイアログの下書き（選んでいて、まだ確定していない値。アイテムの項目と、ページの設定の項目）を重ねたページ。
// 見せ方が描くのに使う
export function useShownPage(stage: string): ItemPage | null {
  const page = usePage(stage)
  const book = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book)
  const preview = useMatomezuState(s => s.dialog?.preview ?? null)
  return useMemo(() => {
    if (!page || !preview || preview.book !== book) return page
    if (preview.item === undefined)
      return preview.page === (page as { id?: string }).id ? withSettings(page, preview.props) : page
    if (!page.items) return page
    const items = page.items.map(i =>
      i.id === preview.item
        ? ({
            ...i,
            props: { ...(i.props as object), ...preview.props },
            ...preview.content,
          } as PlacedItem)
        : i,
    )
    return { ...page, items }
  }, [page, book, preview])
}

// アクションを行えるか（認可ステップも見る）: 使えれば ok、認可ステップが止めたなら permission にそのステップの id（タイプなどで使えなければ null）。
// ブックが対象のアクションは、そのステージで開いているブックの where の所で問う（where を渡さなければ、開いているページ）。
// 利用者の設定が対象のアクションは、where に変える項目の id（settings）を渡して問う。
// 止められたときに、薄くする・消すなどをどうするかは、使う側が決める
export type Allowed = { ok: true } | { ok: false; permission: string | null }

export function useAllowed(stage: string, action: ActionId, where?: Where | { settings: readonly string[] }): Allowed {
  const catalog = useCatalog().core
  const home = useHome()
  const settings = where && "settings" in where ? where.settings.join("\n") : undefined
  const place = where && !("settings" in where) ? where : undefined
  const items = place?.items?.join("\n")
  // 答えを文字にして比べ、変わったときだけ描き直す（"" は使える、"-" はタイプなどで使えない、ほかは止めた認可ステップの id）
  const answer = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    const onBook = catalog.actions.get(action)?.target === "book"
    const book = onBook && o ? s.books[o.book] : undefined
    const page = place?.page ?? o?.page ?? undefined
    const at = { ...(page ? { page } : {}), ...(items ? { items: items.split("\n") } : {}) }
    const ids = settings === undefined ? {} : { settings: settings === "" ? [] : settings.split("\n") }
    const done = inspect(catalog, { kind: "action", action, book, ...(book ? { where: at } : {}), ...ids }, { home })
    return done.value === true ? "" : (deniedBy(done) ?? "-")
  })
  return answer === "" ? { ok: true } : { ok: false, permission: answer === "-" ? null : answer }
}

// そのステージ（読むだけ。無いステージなら null）
export function useStage(stage: string): StageView | null {
  const catalog = useCatalog().core
  const found = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage))
  const tool = useMatomezuState(s => toolOf(catalog, s.workspace, stage, s.books))
  return useMemo(() => (found ? stageView(catalog, found, tool) : null), [catalog, found, tool])
}

// 機能台帳（定義の表。読むだけ。コマンドの ctx.catalog と同じ物）
export function useCoreCatalog(): CoreCatalog {
  return useCatalog().core
}

// 見た目の表（ほかのプラグインのアイテムを描く見せ方が使う。読むだけ）
export function useUiCatalog(): UiCatalog {
  return useUi()
}

// 利用者の設定: 今の言語と、利用者の設定の項目の id → 残した値（機能台帳に無い項目・形に合わない値もそのまま）
export function useSettings(): { lang: Lang; values: Settings } {
  const lang = useMatomezuState(s => s.lang)
  const values = useMatomezuState(s => s.settings)
  return useMemo(() => ({ lang, values }), [lang, values])
}

// 利用者の設定の項目 id の値（値が無いか形に合わなければ既定。既定も無い・機能台帳に無い項目なら undefined）
export function useUserSetting(id: string): unknown {
  const catalog = useCatalog().core
  const values = useMatomezuState(s => s.settings)
  return useMemo(() => userSetting(catalog, values, id), [catalog, values, id])
}

// そのステージが開いているブックにアクションを行う関数（ブックが対象でないアクションは、ブックを渡さずに行う）。データを変える入口はこれだけ
export function usePerform(stage: string): <Id extends ActionId>(action: Id, args: ArgsOf<Id>) => Performed<Id> {
  const { perform } = useActions()
  const catalog = useCatalog().core
  const book = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book)
  return useMemo(
    () =>
      <Id extends ActionId>(action: Id, args: ArgsOf<Id>): Performed<Id> => {
        const loose = perform as (id: string, args: unknown, on?: { book: string }) => Performed<Id>
        if (catalog.actions.get(action)?.target !== "book") return loose(action, args)
        return book === undefined ? { ok: false, reason: "no-book" } : loose(action, args, { book })
      },
    [perform, catalog, book],
  )
}
