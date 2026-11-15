// プラグインの見た目が使うフック（matomezu/ui）: 描いている場所（ui/scope.tsx）から、約束のものだけを引く。状態を丸ごとは見せない。
// 読む物（ブック・ページ・アイテム）は描くページから、操作（アクション・ステージごとのプラグイン状態・紙をずらす量など）は向け先から引く。
// ステージは読むだけの StageView（プラグインが持つ状態は usePluginState・useSetPluginState）、ほかに機能台帳と利用者の設定。データを変える入口は usePerform（アクション）だけ。
// 橋渡しの間、古い形（第 1 引数にステージの id）も受け、描いている場所と違えば落とす
import { useCallback, useLayoutEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { USER } from "../core/actor"
import { pagedOf, withSettings } from "../core/book"
import type { ActionId, ItemId, SubjectId } from "../core/catalog"
import type { CoreCatalog } from "../core/core-catalog"
import { type ActionOn, isOnBook, type RecordOf, type Where } from "../core/def/action"
import type { PluginStateDef, PluginStateScope } from "../core/def/plugin-state"
import { fail } from "../core/errors"
import type { Point, Size } from "../core/geom"
import type { Lang } from "../core/i18n/i18n"
import { actionQuery, deniedBy, inspect } from "../core/inspect"
import { type ArgsOf, type Permitted, permittedIn } from "../core/perform"
import {
  findShape,
  type ItemPage,
  type PlacedItem,
  type PlacedOf,
  type PlacedShape,
  replaceShape,
} from "../core/placed"
import { type Condition, type ConditionOf, inOrder, type Order, type OrderOf, unknownKey } from "../core/record-keys"
import { find, sourceOf } from "../core/record-source"
import type { Book } from "../core/schema/book"
import { type Settings, userSetting } from "../core/settings"
import { stageBlocks, toPaper } from "../core/stage"
import { currentScreen, shownScreens, stageIn } from "../core/window"
import type { StageView } from "../core/workspace"
import { ownedPluginState } from "../store/plugin-state"
import { type BoundPlaceActions, boundActions, type Performed, type WindowActions } from "../store/store"
import { worldOf } from "../store/world"
import {
  type Owner,
  usePluginStateAt,
  useReadPluginStateAt,
  useSetPluginStateAt,
  useStageAt,
  useUpdatePluginStateAt,
} from "./at-hooks"
import type { UiCatalog } from "./plugin"
import { bookOf, checkLegacy, openedOf, pageOf, useAt, useScope, useStageId } from "./scope"
import { useScreenHere } from "./screen-context"
import {
  useCatalog,
  useControlCenter,
  useInstance,
  useMatomezuState,
  useReadState,
  useActions as useStoreActions,
  useUiCatalog as useUi,
} from "./store-context"

// 描くページのブック（何も開いていなければ null）
export function useBook(legacy?: string): Book | null {
  const scope = useScope()
  checkLegacy(scope, legacy, "useBook")
  return useMatomezuState(s => bookOf(s, scope))
}

// 描くページ（ページを持たないブック・ページを開いていなければ null）
export function usePage(legacy?: string): ItemPage | null {
  const scope = useScope()
  checkLegacy(scope, legacy, "usePage")
  return useMatomezuState(s => pageOf(s, scope))
}

// 描くページのブックの、ページ page のアイテム item（どの深さの子の形も。無いか、id が Id のアイテムでなければ undefined）
export function useItemAt<Id extends ItemId>(page: string, item: string, id?: Id): PlacedOf<Id> | undefined {
  const scope = useScope()
  return useMatomezuState(s => {
    const book = pagedOf(bookOf(s, scope) ?? undefined)
    const p = book?.pages.find(p => p.id === page) as ItemPage | undefined
    // ページのアイテムか、どの深さの子の形も
    const found = p && (p.items?.find(i => i.id === item) ?? findShape(p, item)?.shape)
    return found && (id === undefined || found.item === id) ? (found as unknown as PlacedOf<Id>) : undefined
  })
}

// 橋渡しの間だけ: 古い形（第 1 引数にステージの id）。新しい形は useItemAt（最後に useItem に戻す）
export function useItem<Id extends ItemId>(
  legacy: string,
  page: string,
  item: string,
  id?: Id,
): PlacedOf<Id> | undefined {
  checkLegacy(useScope(), legacy, "useItem")
  return useItemAt(page, item, id)
}

// 描くページのブックに、ダイアログの下書き（ブックの設定の項目の、まだ確定していない値）を重ねたブック。見せ方が描くのに使う
export function useShownBook(legacy?: string): Book | null {
  const book = useBook(legacy)
  const preview = useMatomezuState(s => s.dialog?.preview ?? null)
  return useMemo(() => {
    if (!book || !preview || preview.book !== book.id || preview.item !== undefined || preview.page !== undefined)
      return book
    return withSettings(book, preview.props)
  }, [book, preview])
}

// 描くページに、ダイアログの下書き（選んでいて、まだ確定していない値。アイテムの項目と、ページの設定の項目）を重ねたページ。
// 見せ方が描くのに使う
export function useShownPage(legacy?: string): ItemPage | null {
  const page = usePage(legacy)
  const scope = useScope()
  const book = useMatomezuState(s => openedOf(s, scope)?.book)
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
// ブックが対象のアクションは、向け先のステージで開いているブックの where の所で問う（where を渡さなければ、開いているページ）。
// 向け先が無い所（見るだけのページの中）では、行えない。
// 利用者の設定が対象のアクションは、where に変える項目の id（settings）を渡して問う。
// 止められたときに、薄くする・消すなどをどうするかは、使う側が決める
export type Allowed = { ok: true } | { ok: false; permission: string | null }

export function useAllowed(action: ActionId, where?: Where | { settings: readonly string[] }): Allowed
// 橋渡しの間だけ: 古い形（第 1 引数にステージの id）
export function useAllowed(legacy: string, action: ActionId, where?: Where | { settings: readonly string[] }): Allowed
export function useAllowed(...given: readonly unknown[]): Allowed {
  const old = typeof given[1] === "string"
  const action = (old ? given[1] : given[0]) as ActionId
  const where = (old ? given[2] : given[1]) as Where | { settings: readonly string[] } | undefined
  const scope = useScope()
  checkLegacy(scope, old ? (given[0] as string) : undefined, "useAllowed")
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
    const book = o ? s.books[o.book] : undefined
    const page = place?.page ?? o?.page ?? undefined
    const on = { ...(page ? { page } : {}), ...(ids ? { ids: ids.split("\n") } : {}) }
    const changed = settings === undefined ? {} : { settings: settings === "" ? [] : settings.split("\n") }
    const done = inspect(catalog, { ...actionQuery(catalog, action, book, on), ...changed }, { controlCenter })
    return done.value === true ? OK : (deniedBy(done) ?? NOT_ALLOWED)
  })
  return allowedOf(answer)
}

// 答えは文字にして比べ、変わったときだけ描き直す（OK は使える、NOT_ALLOWED はタイプなどで使えない、ほかは止めた認可ステップの id）
const OK = ""
const NOT_ALLOWED = "-"
const allowedOf = (answer: string): Allowed =>
  answer === OK ? { ok: true } : { ok: false, permission: answer === NOT_ALLOWED ? null : answer }

// アクション action を引数 args で、行うときと同じ形（ブックかアノテーションが対象なら on のブック）で行えるか（認可ステップも見る。答えは useAllowed と同じ形）。
// どのブックに問うかは、アクションの許可スコープ（permissionScope）と引数、ブックが対象なら on で決まるので、ステージが開いていないブックにも問える。
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

// 向け先のステージ（読むだけ。向け先がステージでなければ null。見るだけのページの中でも null）。紙をずらしただけでは描き直さない
export function useStage(legacy?: string): StageView | null {
  const scope = useScope()
  checkLegacy(scope, legacy, "useStage")
  return useStageAt(useStageId())
}

// 値のある場所: ステージごとの宣言は向け先のステージ、スクリーンごとの宣言は描いているスクリーン（どちらも呼び出しには渡さない。描いている場所から決まる）。
// 向け先がステージでない所（見るだけのページの中など）では、ステージごとの宣言の値は無く、置いても何も変わらない。
// スクリーンごとの宣言は、スクリーンの id を渡して名指せる（スクリーンを並べるスクリーンアレンジメントのウィジェットが、並べる 1 枚ごとの値を読み書きするとき）
// 橋渡しの間だけ: ステージごとの宣言に、ステージの id を渡す古い形も受ける
type At<Sc extends PluginStateScope> = Sc extends "window" ? [] : [place?: string]

// 宣言の範囲 scope の値がある場所の id（窓の範囲は ""。場所が無ければ null）。given は呼び出しに渡された id
function usePluginPlace(scope: PluginStateScope): (given: string | undefined, hook: string) => string | null {
  const here = useScope()
  const stage = useStageId()
  const screen = useScreenHere()?.id ?? (here.actsOn.kind === "screen" ? here.actsOn.screen : null)
  return useCallback(
    (given, hook) => {
      if (scope === "window") return ""
      if (scope === "screen") return given ?? screen
      checkLegacy(here, given, hook)
      return stage
    },
    [scope, here, stage, screen],
  )
}

// プラグイン状態 def の今の値（無ければ undefined）。自分の kit を渡し、自分の宣言だけを読む（ほかのプラグインの宣言は E125）。置き直すたびに描き直す
export function usePluginState<S>(kit: Owner, def: PluginStateDef<S>, place?: string): S | undefined {
  return usePluginStateAt(kit, def, usePluginPlace(def.scope)(place, "usePluginState"))
}

// プラグイン状態 def を、描き直さずに読む関数（置いた側が、前に置いた値と比べるときなど）
export function useReadPluginState<S, Sc extends PluginStateScope>(
  kit: Owner,
  def: PluginStateDef<S> & { scope: Sc },
): (...at: At<Sc>) => S | undefined {
  const read = useReadPluginStateAt(kit, def)
  const placeOf = usePluginPlace(def.scope)
  return useCallback(
    (...given: readonly (string | undefined)[]) => {
      const at = placeOf(given[0], "useReadPluginState")
      return at === null ? undefined : read(at)
    },
    [read, placeOf],
  )
}

// プラグイン状態 def の値を変える関数（引数が新しい値。undefined なら消す。場所が無ければ置かない。画面の場所に入れる宣言の形に合わなければ E123）
export function useSetPluginState<S, Sc extends PluginStateScope>(
  kit: Owner,
  def: PluginStateDef<S> & { scope: Sc },
): (...args: [...At<Sc>, S | undefined] | [S | undefined]) => void {
  const set = useSetPluginStateAt(kit, def)
  const placeOf = usePluginPlace(def.scope)
  const named = def.scope !== "window"
  return useCallback(
    (...args: unknown[]) => {
      const at = placeOf(named && args.length === 2 ? (args[0] as string) : undefined, "useSetPluginState")
      if (at !== null) set(at, args[args.length - 1] as S | undefined)
    },
    [set, placeOf, named],
  )
}

// ほかのプラグインの宣言に値を入れる関数（宣言の id と値。画面の場所に入れる宣言＝address を持つ宣言だけが受ける。形は土台が宣言の形で確かめる）。入れたら true、
// 宣言が無い・address が無い・形に合わない値・場所の無い範囲は何もせず false。ステージごとの宣言は at.stage のステージの値。
// スクリーンごとの宣言は、at.screenDef（書き先のスクリーンの定義の id）の開いているスクリーンの値（複数なら最後にカレントにした 1 枚。開いていなければ false）。
// screenDef を渡さなければ、このビューがいるスクリーンの値（スクリーンの外の物は false。窓のカレントスクリーンには落とさない）。
// ステージごとの宣言は、向け先のステージの値（向け先がステージでなければ false）。
// 同じ値なら何も変わらず、ブラウザの履歴に積まない。ほかのプラグインのコードは読まず、id の文字と値だけで頼む（自分の宣言は useSetPluginState）
export function useSetPluginStateById(): (
  id: string,
  value: unknown,
  at?: { screenDef?: string; stage?: string },
) => boolean {
  const { setPluginStateById } = useInstance()
  const here = useScreenHere()?.id
  const scope = useScope()
  const stage = useStageId()
  return useCallback(
    (id, value, at) => {
      checkLegacy(scope, at?.stage, "useSetPluginStateById")
      return setPluginStateById(id, value, {
        ...(here !== undefined ? { screen: here } : {}),
        ...(stage !== null ? { stage } : {}),
        ...(at?.screenDef !== undefined ? { screenDef: at.screenDef } : {}),
      })
    },
    [setPluginStateById, here, scope, stage],
  )
}

// 複数のプラグイン状態の値を、1 回で書く関数（途中の、片方だけ変わった状態を知らせない）。自分の kit を渡し、自分の宣言だけを書く。
// 変え方は [宣言, 新しい値] の並び（ステージごとの宣言は向け先のステージの値。向け先がステージでなければ、その変え方は捨てる）
// 橋渡しの間だけ: 古い形 [宣言, ステージ（ステージに結ばない宣言は null）, 新しい値] も受ける
export function useSetPluginStates(
  kit: Owner,
): (
  changes: readonly (
    | readonly [def: PluginStateDef<unknown>, value: unknown]
    | readonly [def: PluginStateDef<unknown>, legacy: string | null, value: unknown]
  )[],
) => void {
  const { setPluginStates } = useInstance()
  const id = kit.id
  const scope = useScope()
  const stage = useStageId()
  return useCallback(
    changes =>
      setPluginStates(
        changes.flatMap(change => {
          const def = change[0]
          if (change.length === 3 && change[1] !== null) checkLegacy(scope, change[1], "useSetPluginStates")
          const at = def.scope === "window" ? null : stage
          if (def.scope !== "window" && at === null) return []
          return [[ownedPluginState(id, def).id, at, change[change.length - 1]] as const]
        }),
      ),
    [setPluginStates, id, scope, stage],
  )
}

// プラグイン状態 def の値を、今の値から change が返す値にする関数（引数が change。場所が無ければ何もしない）
export function useUpdatePluginState<S, Sc extends PluginStateScope>(
  kit: Owner,
  def: PluginStateDef<S> & { scope: Sc },
): (...args: [...At<Sc>, (now: S | undefined) => S | undefined] | [(now: S | undefined) => S | undefined]) => void {
  const update = useUpdatePluginStateAt(kit, def)
  const placeOf = usePluginPlace(def.scope)
  const named = def.scope !== "window"
  return useCallback(
    (...args: unknown[]) => {
      const at = placeOf(named && args.length === 2 ? (args[0] as string) : undefined, "useUpdatePluginState")
      if (at !== null) update(at, args[args.length - 1] as (now: S | undefined) => S | undefined)
    },
    [update, placeOf, named],
  )
}

// 見せ方のビューが、向け先のステージに描く広さ（可変ページで、印刷区画を並べた広さ）を知らせる。null なら紙 1 枚。
// 位置をデータに持たない見せ方は、描く中身を右・下へずらした量 origin（印刷区画の数）も知らせる（変わったら、ステージがパンを合わせる）。
// 広さかずらした量が変わったときだけ知らせ、ビューが消えたら紙 1 枚に戻す。ずらす量の範囲・紙の枠・全体を収める倍率・ミニマップは、この広さで決まる。
// 向け先がステージでない所（見るだけのページの中）では、何も知らせない
export function useStageArea(area: Size | null, origin?: Point | null): void
// 橋渡しの間だけ: 古い形（第 1 引数にステージの id）
export function useStageArea(legacy: string, area: Size | null, origin?: Point | null): void
export function useStageArea(...given: readonly unknown[]): void {
  const old = typeof given[0] === "string"
  const area = (old ? given[1] : given[0]) as Size | null
  const origin = ((old ? given[2] : given[1]) ?? null) as Point | null
  checkLegacy(useScope(), old ? (given[0] as string) : undefined, "useStageArea")
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
export function useStagePan(watch?: boolean): Point | null
// 橋渡しの間だけ: 古い形（第 1 引数にステージの id）
export function useStagePan(legacy: string, watch?: boolean): Point | null
export function useStagePan(...given: readonly unknown[]): Point | null {
  const old = typeof given[0] === "string"
  const watch = ((old ? given[1] : given[0]) ?? true) as boolean
  checkLegacy(useScope(), old ? (given[0] as string) : undefined, "useStagePan")
  const stage = useStageId()
  return useMatomezuState(s => (watch && stage !== null ? (stageIn(s.window, stage)?.pan ?? null) : null))
}

// 表示領域の中の点（左上から）を、向け先のステージの今の紙の上の点に直す関数（描き直さない。押した所を直すときなど、イベントや effect の中で使う）
export function useToPaper(legacy?: string): (p: Point) => Point | null {
  checkLegacy(useScope(), legacy, "useToPaper")
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
export function useLatestPan(legacy?: string): () => Point | null {
  checkLegacy(useScope(), legacy, "useLatestPan")
  const stage = useStageId()
  const read = useReadState()
  return useCallback(() => (stage === null ? null : (stageIn(read().window, stage)?.pan ?? null)), [read, stage])
}

// 描いている場所（ui/scope.tsx）から呼ぶ画面の操作: 窓に向ける操作はそのまま、場所に向ける操作は、向け先（ステージかスクリーン）に向けた形（第 1 引数が無い）。
// 向け先が無い所（見るだけのページの中）では、場所に向ける操作は何もしない。
// 橋渡しの間だけの名前（最後に、これを useActions にする。場所を第 1 引数に取る今の useActions は、土台と骨組みだけが使う）
export function useActionsHere(): WindowActions & BoundPlaceActions {
  const actions = useStoreActions()
  const at = useAt()
  return useMemo(() => ({ ...actions, ...boundActions(actions, at) }), [actions, at])
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

// 向け先のステージが開いているブックにアクションを行う関数（ブックかアノテーションが対象でないアクションは、ブックを渡さずに行う）。データを変える入口はこれだけ。
// 向け先が無い所（見るだけのページの中）からは行わず、no-book を返す。
// 印刷プレビューの間のステージからは、ブックを変えるアクションを行わず print-preview を返す（core/stage.ts の stageBlocks）
export function usePerform(legacy?: string): <Id extends ActionId>(action: Id, args: ArgsOf<Id>) => Performed<Id> {
  checkLegacy(useScope(), legacy, "usePerform")
  const at = useAt()
  const { perform } = useStoreActions()
  const catalog = useCatalog().core
  const book = useMatomezuState(s => (at === null ? undefined : stageIn(s.window, at)?.opened?.book))
  const mode = useMatomezuState(s => (at === null ? undefined : stageIn(s.window, at)?.mode.kind) ?? "edit")
  return useMemo(
    () =>
      <Id extends ActionId>(action: Id, args: ArgsOf<Id>): Performed<Id> => {
        const loose = perform as (id: string, args: unknown, on?: ActionOn) => Performed<Id>
        if (at === null) return { ok: false, reason: "no-book" } // 向け先が無い所からは、何も行わない
        if (stageBlocks(catalog, mode, action)) return { ok: false, reason: "print-preview" }
        if (!isOnBook(catalog.actions.get(action)?.target)) return loose(action, args)
        return book === undefined ? { ok: false, reason: "no-book" } : loose(action, args, { book })
      },
    [perform, catalog, book, mode, at],
  )
}

// 橋渡しの間だけ: 描いている場所の、古い形のフックに渡す値（ステージの id・スクリーンの id・窓は none）。最後に無くす
export const useScreenId = (): string => useScope().legacy

// useRecords の読み方: 索引キーの条件（全部を読むなら空）・並び（無ければ id の順）・件数（無ければ合う全部）。
// 合うか・並びは、アクションの reads とホストの読みと同じ関数（core/record-keys.ts）で決める
// 条件と並びに書けるのは、種類 T が宣言した索引キーの名前と、その値の型だけ
export interface RecordsQuery<T extends SubjectId> {
  where: readonly ConditionOf<T>[]
  order?: OrderOf<T>
  limit?: number
}

// 対象の定義の種類 subject のレコードのうち、query に合う物。定義の record に合わない物（warning W025 の物）は返さない。
// 宣言に無い索引キーを条件か並びに書けば、何も返さない。返す配列は、その種類のレコードと query が変わらない間は同じ参照
export function useRecords<const T extends SubjectId>(subject: T, query: RecordsQuery<T>): readonly RecordOf<T>[] {
  const catalog = useCoreCatalog()
  const table = useMatomezuState(s => s.records[subject])
  const asked = JSON.stringify(query)
  return useMemo(() => {
    const { where, order, limit } = JSON.parse(asked) as { where: readonly Condition[]; order?: Order; limit?: number }
    const def = catalog.subjects.get(subject)
    // 並びのキーは find が見ないので、ここで確かめる（宣言に無ければ何も返さない）
    if (!def || unknownKey(def, [], order) !== null) return []
    const rows = Object.entries(find(catalog, sourceOf({ [subject]: table ?? {} }), subject, where))
      .filter(([, r]) => def.record.safeParse(r.record).success)
      .map(([id, r]) => ({ id, keys: r.keys, record: r.record }))
    return inOrder(rows, order)
      .slice(0, limit)
      .map(r => r.record) as RecordOf<T>[]
  }, [catalog, subject, table, asked])
}

// 種類 subject の id のレコード 1 件（無いか、定義の record に合わなければ undefined）
export function useRecord<const T extends SubjectId>(subject: T, id: string): RecordOf<T> | undefined {
  const catalog = useCoreCatalog()
  const one = useMatomezuState(s => s.records[subject]?.[id])
  return useMemo(() => {
    const record = catalog.subjects.get(subject)?.record
    return one !== undefined && record?.safeParse(one).success ? (one as RecordOf<T>) : undefined
  }, [catalog, subject, one])
}

// スクリーンの定義の、渡す値の形（確かめて通った値の型 P だけを見る）
interface PropsShape<P> {
  safeParse(value: unknown): { success: true; data: P } | { success: false }
}

// 描いている場所のスクリーン（定義 def のスクリーンの中のビューが使う）: 開いた 1 枚の id・渡された値・見えているか・カレントスクリーンか。
// スクリーンの外や、ほかの定義のスクリーンの中で呼べば E126
export function useScreen<P>(def: { id: string; props: PropsShape<P> }): {
  id: string
  props: P
  shown: boolean
  current: boolean
} {
  const here = useScreenHere()
  if (here === null || here.def !== def.id) return fail("E126", { screen: def.id })
  return here as { id: string; props: P; shown: boolean; current: boolean }
}

// 窓のスクリーン: 開いているスクリーンの並び（開いた順。1 枚ごとの id・定義の id・渡された値・見えているか・カレントスクリーンか）と、
// 開く（定義と渡す値。開いた 1 枚の id を返し、カレントスクリーンにする。値が定義の形に合わなければ開かず refused）・カレントスクリーンにする・閉じる
export function useScreens(): {
  screens: readonly { id: string; def: string; props: unknown; shown: boolean; current: boolean }[]
  open<P>(def: { id: string; props: PropsShape<P> }, props: P): string
  setProps<P>(id: string, def: { id: string; props: PropsShape<P> }, props: P): boolean // 開いているスクリーン id（定義 def の物）の渡す値を替える（スクリーンは積まず、ブラウザの履歴には積む）
  makeCurrent(id: string): void
  close(id: string): void
} {
  const catalog = useCoreCatalog()
  const opened = useMatomezuState(s => s.window.screens)
  const current = useMatomezuState(s => currentScreen(s.window).id)
  const shown = useMatomezuState(useShallow(s => shownScreens(catalog, s.window)))
  const { openScreen, setScreenProps, makeScreenCurrent, closeScreen } = useStoreActions()
  const screens = useMemo(
    () =>
      opened.map(s => ({
        id: s.id,
        def: s.def,
        props: s.props,
        shown: shown.includes(s.id),
        current: s.id === current,
      })),
    [opened, current, shown],
  )
  const open = useCallback(
    <P>(def: { id: string; props: PropsShape<P> }, props: P) => openScreen(def.id, props),
    [openScreen],
  )
  const setProps = useCallback(
    <P>(id: string, _def: { id: string; props: PropsShape<P> }, props: P) => setScreenProps(id, props),
    [setScreenProps],
  )
  return { screens, open, setProps, makeCurrent: makeScreenCurrent, close: closeScreen }
}

// ブラウザの履歴を 1 つ戻す（ブラウザの戻るボタンと同じ。ブック・ページ・スクリーンの移動を、積んだ順に戻る）。
// canGoBack は、この窓の中に戻る先があるか（無いときの goBack は何もしない。窓の外へは出ない）
export function useBrowserBack(): { canGoBack: boolean; goBack(): void } {
  const canGoBack = useMatomezuState(s => s.canGoBack)
  const { requestBack } = useStoreActions()
  return { canGoBack, goBack: requestBack }
}
