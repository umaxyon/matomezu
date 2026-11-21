// プラグインの見た目が使うフック（matomezu/ui）: 描いている場所（ui/scope.tsx）から、約束のものだけを引く。状態を丸ごとは見せない。
// 読む物（ブック・ページ・アイテム）は描くページから、操作（アクション・ステージごとのプラグイン状態・紙をずらす量など）は向け先から引く。
// ステージは読むだけの StageView（プラグインが持つ状態は ui/plugin-state-hooks.ts の usePluginState・useSetPluginState）、ほかに機能台帳と利用者の設定。データを変える入口は usePerform（アクション）だけ。

import { useCallback, useLayoutEffect, useMemo } from "react"
import { USER } from "../core/actor"
import { withSettings } from "../core/book"
import type { ActionId, ItemId } from "../core/catalog"
import type { CoreCatalog } from "../core/core-catalog"
import { type ActionOn, isInBook, isOnPage, type PageTarget, type Where } from "../core/def/action"
import type { Point, Size } from "../core/geom"
import type { Lang } from "../core/i18n/i18n"
import { actionQuery, deniedBy, inspect } from "../core/inspect"
import { type ArgsOf, noPage, type TargetOf } from "../core/perform"
import type { Permitted } from "../core/perform-permit"
import { permittedIn } from "../core/perform-world"
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
import { askedOutermostOf, openedPageById, shownPageId, stageBlocks, toPaper } from "../core/stage"
import { stageIn } from "../core/window"
import type { StageView } from "../core/workspace"
import {
  type BoundPlaceActions,
  boundActions,
  type Performed,
  REFUSED_WINDOW_ACTIONS,
  type WindowActions,
  windowActionsOf,
} from "../store/actions"
import { worldOf } from "../store/world"
import { useStageAt } from "./at-hooks"
import type { UiCatalog } from "./plugin"
import { bookOf, openedOf, pageOf, useAt, useScope, useStageId } from "./scope"
import {
  useCatalog,
  useControlCenter,
  useMatomezuState,
  useReadState,
  useStoreActions,
  useUiCatalog as useUi,
} from "./store-context"

// 描くページのブック（何も開いていなければ null）
export function useBook(): Book | null {
  const scope = useScope()
  return useMatomezuState(s => bookOf(s, scope))
}

// 描くページ（ページを持たないブック・ページを開いていなければ null）
export function usePage(): ItemPage | null {
  const scope = useScope()
  return useMatomezuState(s => pageOf(s, scope))
}

// 描くページのステージが開いている物の中の、id のページ（開いている物に無いページ・何も開いていなければ null）
export function usePageById(id: string): ItemPage | null {
  const scope = useScope()
  return useMatomezuState(s => {
    const opened = openedOf(s, scope)
    return opened ? openedPageById(s.books, s.pages, opened, id) : null
  })
}

// 描くページのステージが開いている物の中の、ページ page のアイテム item（どの深さの子の形も。無いか、id が Id のアイテムでなければ undefined）
export function useItem<Id extends ItemId>(page: string, item: string, id?: Id): PlacedOf<Id> | undefined {
  const scope = useScope()
  return useMatomezuState(s => {
    const opened = openedOf(s, scope)
    const p = opened ? openedPageById(s.books, s.pages, opened, page) : null
    // ページのアイテムか、どの深さの子の形も
    const found = p && (p.items?.find(i => i.id === item) ?? findShape(p, item)?.shape)
    return found && (id === undefined || found.item === id) ? (found as unknown as PlacedOf<Id>) : undefined
  })
}

// 描くページのブックに、ダイアログの下書き（ブックの設定の項目の、まだ確定していない値）を重ねたブック。プレゼンテーションが描くのに使う
export function useShownBook(): Book | null {
  const book = useBook()
  const preview = useMatomezuState(s => s.dialog?.preview ?? null)
  return useMemo(() => {
    if (!book || !preview || preview.book !== book.id || preview.item !== undefined || preview.page !== undefined)
      return book
    return withSettings(book, preview.props)
  }, [book, preview])
}

// 描くページに、ダイアログの下書き（選んでいて、まだ確定していない値。アイテムの項目と、ページの設定の項目）を重ねたページ。
// ページの設定の項目の下書きは、ページを名指した下書きならそのページにだけ、ページを名指さない下書き（ブックのページをまとめて変えるダイアログ）なら、そのブックのどのページにも重ねる。
// プレゼンテーションが描くのに使う
export function useShownPage(): ItemPage | null {
  const page = usePage()
  const scope = useScope()
  const book = useMatomezuState(s => openedOf(s, scope)?.book)
  const preview = useMatomezuState(s => s.dialog?.preview ?? null)
  return useMemo(() => {
    if (!page || !preview || preview.book !== book) return page
    if (preview.item === undefined)
      return preview.page === undefined || preview.page === page.id ? withSettings(page, preview.props) : page
    // ページのアイテムか、どの深さの子の形も
    const shown = (i: PlacedItem): PlacedItem =>
      ({ ...i, props: { ...(i.props as object), ...preview.props }, ...preview.content }) as PlacedItem
    const top = page.items?.find(i => i.id === preview.item)
    if (top) return { ...page, items: (page.items ?? []).map(i => (i === top ? shown(i) : i)) }
    return replaceShape(page, preview.item, s => shown(s) as PlacedShape) ?? page
  }, [page, book, preview])
}

// アクションを行えるか（認可ステップも見る）: 使えれば ok、認可ステップが止めたなら permission にそのステップの id（タイプなどで使えなければ null）。
// ブックかページが対象のアクションは、向け先のステージで開いているブックの where の所で問う（where を渡さなければ、開いているページ）。
// 向け先が無い所（ステージの外で見るだけに描くページの中）では、行えない。
// 利用者の設定が対象のアクションは、where に変える項目の id（settings）を渡して問う。
// 止められたときに、薄くする・消すなどをどうするかは、使う側が決める
export type Allowed = { ok: true } | { ok: false; permission: string | null }

export function useAllowed(action: ActionId, where?: Where | { settings: readonly string[] }): Allowed {
  const at = useAt()
  const catalog = useCatalog().core
  const controlCenter = useControlCenter()
  const settings = where && "settings" in where ? where.settings.join("\n") : undefined
  const place = where && !("settings" in where) ? where : undefined
  const ids = place?.ids?.join("\n")
  const answer = useMatomezuState(s => {
    if (at === null) return NOT_ALLOWED // 向け先が無い所からは、何も行わない
    const st = stageIn(s.window, at)
    if (st && stageBlocks(catalog, st.mode.kind, action)) return NOT_ALLOWED
    const o = st?.opened
    const asked = askedOutermostOf(s, o)
    const page = place?.page ?? shownPageId(o ?? null) ?? undefined
    const on = { ...(page ? { page } : {}), ...(ids ? { ids: ids.split("\n") } : {}) }
    const changed = settings === undefined ? {} : { settings: settings === "" ? [] : settings.split("\n") }
    const done = inspect(catalog, { ...actionQuery(catalog, action, asked, on), ...changed }, { controlCenter })
    return done.value === true ? OK : (deniedBy(done) ?? NOT_ALLOWED)
  })
  return allowedOf(answer)
}

// 答えは文字にして比べ、変わったときだけ描き直す（OK は使える、NOT_ALLOWED はタイプなどで使えない、ほかは止めた認可ステップの id）
const OK = ""
const NOT_ALLOWED = "-"
const allowedOf = (answer: string): Allowed =>
  answer === OK ? { ok: true } : { ok: false, permission: answer === NOT_ALLOWED ? null : answer }

// アクション action を引数 args で、行うときと同じ形（ブックかアノテーションが対象なら on のブック、ページが対象なら on のページ）で行えるか（認可ステップも見る。答えは useAllowed と同じ形）。
// どのブックに問うかは、アクションの許可スコープ（permissionScope）と引数、ブックかページが対象なら on で決まるので、ステージが開いていないブックにも問える。
// 引数がまだ決まらない所（ドラッグを始める前など）では、useAllowed で問う
export function useAllowedOn<Id extends ActionId>(action: Id, args: ArgsOf<Id>, on?: ActionOn): Allowed {
  const catalog = useCatalog().core
  const controlCenter = useControlCenter()
  const answer = useMatomezuState(s => {
    const done: Permitted | { ok: false; reason: string } = permittedIn(worldOf(s), action, args, on, {
      catalog,
      controlCenter,
      actor: USER,
    })
    return done.ok ? OK : done.reason === "denied" && "permission" in done ? done.permission : NOT_ALLOWED
  })
  return allowedOf(answer)
}

// 向け先のステージ（読むだけ。向け先がステージでなければ null。ステージの外で見るだけに描くページの中でも null）。紙をずらしただけでは描き直さない
export function useStage(): StageView | null {
  return useStageAt(useStageId())
}

// プレゼンテーションのビューが、向け先のステージに描く広さ（可変ページで、印刷区画を並べた広さ）を知らせる。null なら紙 1 枚。
// 位置をデータに持たないプレゼンテーションは、描く中身を右・下へずらした量 origin（印刷区画の数）も知らせる（変わったら、ステージがパンを合わせる）。
// 広さかずらした量が変わったときだけ知らせ、ビューが消えたら紙 1 枚に戻す。ずらす量の範囲・紙の枠・全体を収める倍率・ミニマップは、この広さで決まる。
// 向け先がステージでない所（ステージの外で見るだけに描くページの中）では、何も知らせない
export function useStageArea(area: Size | null, origin: Point | null = null): void {
  const stage = useStageId()
  const { setStageArea } = useStoreActions()
  const w = area?.w
  const h = area?.h
  const ox = origin?.x ?? 0
  const oy = origin?.y ?? 0
  useLayoutEffect(() => {
    if (stage !== null) setStageArea(stage, w !== undefined && h !== undefined ? { w, h } : null, { x: ox, y: oy })
  }, [setStageArea, stage, w, h, ox, oy])
  useLayoutEffect(
    () => () => {
      if (stage !== null) setStageArea(stage, null)
    },
    [setStageArea, stage],
  )
}

// 向け先のステージの紙をずらす量（向け先がステージでなければ null）。ずらすたびに描き直す（紙を置く所など、ずらす量で描くものが使う）。
// watch が false の間は null を返し、ずらしても描き直さない（ドラッグの間だけ追うときなど）
export function useStagePan(watch = true): Point | null {
  const stage = useStageId()
  return useMatomezuState(s => (watch && stage !== null ? (stageIn(s.window, stage)?.pan ?? null) : null))
}

// 表示領域の中の点（左上から）を、向け先のステージの今の紙の上の点に直す関数（描き直さない。押した所を直すときなど、イベントや effect の中で使う）
export function useToPaper(): (p: Point) => Point | null {
  const stage = useStageId()
  const read = useReadState()
  return useCallback(
    (p: Point) => {
      const st = stage === null ? undefined : stageIn(read().window, stage)
      return st ? toPaper(st, p) : null
    },
    [read, stage],
  )
}

// 向け先のステージの今の紙をずらす量を読む関数（描き直さない。押した所を紙の上の点に直すときなど、イベントや effect の中で読む）
export function useLatestPan(): () => Point | null {
  const stage = useStageId()
  const read = useReadState()
  return useCallback(() => (stage === null ? null : (stageIn(read().window, stage)?.pan ?? null)), [read, stage])
}

// 描いている場所（ui/scope.tsx）から呼ぶ画面の操作: 窓に向ける操作はそのまま、場所に向ける操作は、向け先（ステージかスクリーン）に向けた形（第 1 引数が無い）。
// 向け先が無い所（ステージの外で見るだけに描くページの中）では、どの操作も何もしない（アクションは no-book で断る）。
// 場所を第 1 引数に取る素の操作（ui/store-context.tsx の useStoreActions）は、土台と骨組みだけが使う
export function useActions(): WindowActions & BoundPlaceActions {
  const actions = useStoreActions()
  const at = useAt()
  const nowhere = useScope().actsOn.kind === "none"
  return useMemo(
    () => ({ ...(nowhere ? REFUSED_WINDOW_ACTIONS : windowActionsOf(actions)), ...boundActions(actions, at) }),
    [actions, at, nowhere],
  )
}

// 機能台帳（定義の表。読むだけ。コマンドの ctx.catalog と同じ物）
export function useCoreCatalog(): CoreCatalog {
  return useCatalog().core
}

// 見た目の表（ほかのプラグインのアイテムを描くプレゼンテーションが使う。読むだけ）
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

// 向け先のステージが開いているステージエントリ（ブックか、ブックの外のページ）にアクションを行う関数（ブック・ページ・アノテーションが対象でないアクションは、ブックを渡さずに行う）。データを変える入口はこれだけ。
// ページとページのアノテーションが対象のアクションは、宛先のページを on に渡す（開いているブックのページか、開いているブックの外のページだけ。ほかのページなら no-page を返す）。
// ブックが対象のアクションは、ブックの外のページを開いたステージからは行わず、no-book を返す。
// 向け先が無い所（ステージの外で見るだけに描くページの中）からは行わず、no-book を返す。
// 印刷プレビューの間のステージからは、ブックを変えるアクションを行わず print-preview を返す（core/stage.ts の stageBlocks）
export function usePerform(): <Id extends ActionId>(
  action: Id,
  args: ArgsOf<Id>,
  ...on: TargetOf<Id> extends PageTarget ? [on: { page: string }] : []
) => Performed<Id> {
  const at = useAt()
  const read = useReadState()
  const { perform } = useStoreActions()
  const catalog = useCatalog().core
  const entry = useMatomezuState(s => (at === null ? undefined : stageIn(s.window, at)?.opened?.outermost.id))
  const outside = useMatomezuState(s => at !== null && stageIn(s.window, at)?.opened?.outermost.kind !== "book")
  const mode = useMatomezuState(s => (at === null ? undefined : stageIn(s.window, at)?.mode.kind) ?? "edit")
  return useMemo(
    () =>
      <Id extends ActionId>(action: Id, args: ArgsOf<Id>, ...[on]: [on?: { page: string }]): Performed<Id> => {
        const loose = perform as (id: string, args: unknown, on?: ActionOn) => Performed<Id>
        if (at === null) return { ok: false, reason: "no-book" } // 向け先が無い所からは、何も行わない
        if (stageBlocks(catalog, mode, action)) return { ok: false, reason: "print-preview" }
        const target = catalog.actions.get(action)?.target
        if (!isInBook(target)) return loose(action, args)
        if (entry === undefined) return { ok: false, reason: "no-book" }
        // ブックが対象のアクションは、ブックの外のページを開いたステージからは行えない
        if (!isOnPage(target)) return outside ? { ok: false, reason: "no-book" } : loose(action, args, { book: entry })
        const { books, pages } = read()
        return on && openedPageById(books, pages, { book: entry }, on.page)
          ? loose(action, args, on)
          : noPage(on?.page ?? "")
      },
    [perform, catalog, entry, outside, mode, at, read],
  )
}
