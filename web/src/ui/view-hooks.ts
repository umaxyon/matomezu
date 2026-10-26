// プラグインの見た目が使うフック（matomezu/ui）: matomezu が渡すステージの id から、約束のものだけを引く。状態を丸ごとは見せない。
// データはブック・ページ・アイテム、ステージは読むだけの StageView、ほかに機能台帳と見る人の設定。データを変えるのは usePerform（アクション）だけ
import { useMemo } from "react"
import { pagedOf } from "../core/book"
import type { ActionId, ItemId } from "../core/catalog"
import type { CoreCatalog } from "../core/core-catalog"
import type { Lang } from "../core/i18n/i18n"
import type { ArgsOf } from "../core/perform"
import type { ItemPage, PlacedItem, PlacedOf } from "../core/placed"
import type { Book } from "../core/schema/book"
import { type StageView, stageView, toolOf } from "../core/workspace"
import type { Performed } from "../store/store"
import type { UiCatalog } from "./plugin"
import { useActions, useCatalog, useMatomezuState, useUiCatalog as useUi } from "./store-context"

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

// そのステージが開いているブックの、ページ page のアイテム item（無いか、id が Id のアイテムでなければ undefined）
export function useItem<Id extends ItemId>(
  stage: string,
  page: string,
  item: string,
  id?: Id,
): PlacedOf<Id> | undefined {
  return useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    const book = o ? pagedOf(s.books[o.book]) : undefined
    const found = (book?.pages.find(p => p.id === page) as ItemPage | undefined)?.items?.find(i => i.id === item)
    return found && (id === undefined || found.item === id) ? (found as unknown as PlacedOf<Id>) : undefined
  })
}

// そのステージが開いているページに、ダイアログの下書き（選んでいて、まだ確定していない値）を重ねたページ。見せ方が描くのに使う
export function useShownPage(stage: string): ItemPage | null {
  const page = usePage(stage)
  const book = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book)
  const preview = useMatomezuState(s => s.dialog?.preview ?? null)
  return useMemo(() => {
    if (!page?.items || preview?.item === undefined || preview.book !== book) return page
    const items = page.items.map(i =>
      i.id === preview.item
        ? ({
            ...i,
            props: { ...(i.props as object), ...preview.props },
            ...(preview.content ? { children: preview.content } : {}),
          } as PlacedItem)
        : i,
    )
    return { ...page, items }
  }, [page, book, preview])
}

// そのステージ（読むだけ。無いステージなら null）
export function useStage(stage: string): StageView | null {
  const catalog = useCatalog().core
  const found = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage))
  const tool = useMatomezuState(s => toolOf(catalog, s.workspace, stage))
  return useMemo(() => (found ? stageView(found, tool) : null), [found, tool])
}

// 機能台帳（定義の表。読むだけ。コマンドの ctx.catalog と同じ物）
export function useCoreCatalog(): CoreCatalog {
  return useCatalog().core
}

// 見た目の表（ほかのプラグインのアイテムを描く見せ方が使う。読むだけ）
export function useUiCatalog(): UiCatalog {
  return useUi()
}

// 見る人の設定（言語とスキン）
export function useSettings(): { lang: Lang; skin: string } {
  const lang = useMatomezuState(s => s.settings.lang)
  const skin = useMatomezuState(s => s.settings.skin)
  return useMemo(() => ({ lang, skin }), [lang, skin])
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
