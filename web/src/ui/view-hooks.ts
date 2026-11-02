// プラグインの見た目が使うフック（matomezu/ui）: matomezu が渡すステージの id から、約束のものだけを引く。状態を丸ごとは見せない。
// データはブック・ページ・アイテム、ステージは読むだけの StageView、ほかに機能台帳と利用者の設定。データを変えるのは usePerform（アクション）だけ
import { useCallback, useLayoutEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { pagedOf, withSettings } from "../core/book"
import type { ActionId, ItemId } from "../core/catalog"
import type { CoreCatalog } from "../core/core-catalog"
import { isOnBook, type Where } from "../core/def/action"
import type { Point, Size } from "../core/geom"
import type { Lang } from "../core/i18n/i18n"
import { deniedBy, inspect } from "../core/inspect"
import type { ArgsOf } from "../core/perform"
import {
  findShape,
  type ItemPage,
  type PlacedItem,
  type PlacedOf,
  type PlacedShape,
  replaceShape,
} from "../core/placed"
import type { Book } from "../core/schema/book"
import { type Settings, userSetting } from "../core/settings"
import { toPaper } from "../core/stage"
import { type StageView, stageView, toolOf } from "../core/workspace"
import type { PluginKit } from "../store/kit"
import type { Performed } from "../store/store"
import type { UiCatalog } from "./plugin"
import {
  useActions,
  useCatalog,
  useHome,
  useInstance,
  useMatomezuState,
  useReadState,
  useUiCatalog as useUi,
} from "./store-context"

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
    // ページのアイテムか、どの深さの子の形も
    const shown = (i: PlacedItem): PlacedItem =>
      ({ ...i, props: { ...(i.props as object), ...preview.props }, ...preview.content }) as PlacedItem
    const top = page.items?.find(i => i.id === preview.item)
    if (top) return { ...page, items: (page.items ?? []).map(i => (i === top ? shown(i) : i)) }
    return replaceShape(page, preview.item, s => shown(s) as PlacedShape) ?? page
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
    const onBook = isOnBook(catalog.actions.get(action)?.target)
    const book = onBook && o ? s.books[o.book] : undefined
    const page = place?.page ?? o?.page ?? undefined
    const at = { ...(page ? { page } : {}), ...(items ? { items: items.split("\n") } : {}) }
    const ids = settings === undefined ? {} : { settings: settings === "" ? [] : settings.split("\n") }
    const done = inspect(catalog, { kind: "action", action, book, ...(book ? { where: at } : {}), ...ids }, { home })
    return done.value === true ? "" : (deniedBy(done) ?? "-")
  })
  return answer === "" ? { ok: true } : { ok: false, permission: answer === "-" ? null : answer }
}

// そのステージ（読むだけ。無いステージなら null）。紙をずらしただけでは描き直さない
export function useStage(stage: string): StageView | null {
  const catalog = useCatalog().core
  const found = useMatomezuState(
    useShallow(s => {
      const st = s.workspace.stages.find(st => st.id === stage)
      return st
        ? {
            id: st.id,
            opened: st.opened,
            zoom: st.zoom,
            selection: st.selection,
            editing: st.editing,
            placing: st.placing,
          }
        : null
    }),
  )
  const tool = useMatomezuState(s => toolOf(catalog, s.workspace, stage, s.books))
  return useMemo(() => (found ? stageView(catalog, found, tool) : null), [catalog, found, tool])
}

// 画面の状態の置き場の持ち主（プラグインの kit。kit の id の置き場を使う。id だけの物は受けない）
// biome-ignore lint/suspicious/noExplicitAny: どのプラグインの kit も受ける（文言の表の型は見ない）
type Owner = PluginKit<string, any>

// プラグインが持つ、ステージ stage の画面の状態（無ければ undefined）。自分の kit を渡し、自分の置き場だけを読む。置き直すたびに描き直す
export const useStageState = (stage: string, kit: Owner): unknown =>
  useMatomezuState(s => s.stageStates[stage]?.[kit.id])

// プラグインが持つステージの画面の状態を、描き直さずに読む関数（置いた側が、前に置いた値と比べるときなど）
export function useReadStageState(kit: Owner): (stage: string) => unknown {
  const read = useReadState()
  const { id } = kit
  return useCallback(stage => read().stageStates[stage]?.[id], [read, id])
}

// プラグインが持つ、ステージの画面の状態を変える関数（undefined なら消す。無いステージには置かない）
export function useSetStageState(kit: Owner): (stage: string, value: unknown) => void {
  const { setStageState } = useInstance()
  const { id } = kit
  return useCallback((stage, value) => setStageState(stage, id, value), [setStageState, id])
}

// 見せ方のビューが、そのステージに描く広さ（可変ページで、印刷区画を並べた広さ）を知らせる。null なら紙 1 枚。
// 位置をデータに持たない見せ方は、描く中身を右・下へずらした量 origin（印刷区画の数）も知らせる（変わったら、ステージがパンを合わせる）。
// 広さかずらした量が変わったときだけ知らせ、ビューが消えたら紙 1 枚に戻す。ずらす量の範囲・紙の枠・全体を収める倍率・ミニマップは、この広さで決まる
export function useStageArea(stage: string, area: Size | null, origin: Point | null = null): void {
  const { setStageArea } = useActions()
  const w = area?.w
  const h = area?.h
  const ox = origin?.x ?? 0
  const oy = origin?.y ?? 0
  useLayoutEffect(() => {
    setStageArea(stage, w !== undefined && h !== undefined ? { w, h } : null, { x: ox, y: oy })
  }, [setStageArea, stage, w, h, ox, oy])
  useLayoutEffect(() => () => setStageArea(stage, null), [setStageArea, stage])
}

// そのステージの紙をずらす量（無いステージなら null）。ずらすたびに描き直す（紙を置く所など、ずらす量で描くものが使う）。
// watch が false の間は null を返し、ずらしても描き直さない（ドラッグの間だけ追うときなど）
export function useStagePan(stage: string, watch = true): Point | null {
  return useMatomezuState(s => (watch ? (s.workspace.stages.find(st => st.id === stage)?.pan ?? null) : null))
}

// 表示領域の中の点（左上から）を、そのステージの今の紙の上の点に直す関数（描き直さない。押した所を直すときなど、イベントや effect の中で使う）
export function useToPaper(stage: string): (p: Point) => Point | null {
  const read = useReadState()
  return useCallback(
    (p: Point) => {
      const st = read().workspace.stages.find(st => st.id === stage)
      return st ? toPaper(st, p) : null
    },
    [read, stage],
  )
}

// そのステージの今の紙をずらす量を読む関数（描き直さない。押した所を紙の上の点に直すときなど、イベントや effect の中で読む）
export function useLatestPan(stage: string): () => Point | null {
  const read = useReadState()
  return useCallback(() => read().workspace.stages.find(st => st.id === stage)?.pan ?? null, [read, stage])
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

// そのステージが開いているブックにアクションを行う関数（ブックかアノテーションが対象でないアクションは、ブックを渡さずに行う）。データを変える入口はこれだけ
export function usePerform(stage: string): <Id extends ActionId>(action: Id, args: ArgsOf<Id>) => Performed<Id> {
  const { perform } = useActions()
  const catalog = useCatalog().core
  const book = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book)
  return useMemo(
    () =>
      <Id extends ActionId>(action: Id, args: ArgsOf<Id>): Performed<Id> => {
        const loose = perform as (id: string, args: unknown, on?: { book: string }) => Performed<Id>
        if (!isOnBook(catalog.actions.get(action)?.target)) return loose(action, args)
        return book === undefined ? { ok: false, reason: "no-book" } : loose(action, args, { book })
      },
    [perform, catalog, book],
  )
}
