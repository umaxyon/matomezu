// プラグインの見た目が使うフック（matomezu/ui）: 描いている場所（ui/scope.tsx）から、約束のものだけを引く。状態を丸ごとは見せない。
// 読む物（ブック・ページ・アイテム）は描くページから、操作（アクション・ステージごとのプラグイン状態・紙をずらす量など）は向け先から引く。
// ステージは読むだけの StageView（プラグインが持つ状態は usePluginState・useSetPluginState）、ほかに機能台帳と利用者の設定。データを変える入口は usePerform（アクション）だけ。

import { useCallback, useLayoutEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { USER } from "../core/actor"
import { findPage, withSettings } from "../core/book"
import type { ActionId, ItemId, SubjectId } from "../core/catalog"
import type { CoreCatalog } from "../core/core-catalog"
import { type ActionOn, isInBook, isOnPage, type PageTarget, type RecordOf, type Where } from "../core/def/action"
import type { PluginStateDef, PluginStateScope } from "../core/def/plugin-state"
import { fail } from "../core/errors"
import type { Point, Size } from "../core/geom"
import type { Lang } from "../core/i18n/i18n"
import { actionQuery, deniedBy, inspect } from "../core/inspect"
import { type ArgsOf, noPage, type Permitted, permittedIn, type TargetOf } from "../core/perform"
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
import { shownPageId, stageBlocks, toPaper } from "../core/stage"
import { currentScreen, shownScreens, stageIn } from "../core/window"
import type { StageView } from "../core/workspace"
import { ownedPluginState } from "../store/plugin-state"
import {
  type BoundPlaceActions,
  boundActions,
  type Performed,
  REFUSED_WINDOW_ACTIONS,
  type WindowActions,
  windowActionsOf,
} from "../store/store"
import { worldOf } from "../store/world"
import { useArranged } from "./arranged-context"
import {
  type Owner,
  usePluginStateAt,
  useReadPluginStateAt,
  useSetPluginStateAt,
  useStageAt,
  useUpdatePluginStateAt,
} from "./at-hooks"
import type { UiCatalog } from "./plugin"
import { bookOf, openedOf, pageOf, useAt, useScope, useStageId } from "./scope"
import { useScreenContext } from "./screen-context"
import {
  useCatalog,
  useControlCenter,
  useInstance,
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

// 描くページのブックの、ページ page のアイテム item（どの深さの子の形も。無いか、id が Id のアイテムでなければ undefined）
export function useItem<Id extends ItemId>(page: string, item: string, id?: Id): PlacedOf<Id> | undefined {
  const scope = useScope()
  return useMatomezuState(s => {
    const book = bookOf(s, scope)
    const p = book ? findPage(book, page)?.page : undefined
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
    const book = o ? s.books[o.book] : undefined
    const page = place?.page ?? shownPageId(o ?? null) ?? undefined
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

// 値のある場所: ステージごとの宣言は向け先のステージ、スクリーンごとの宣言は描いているスクリーン（どちらも呼び出しには渡さなくてよい。描いている場所から決まる）。
// 向け先がステージでない所では、ステージごとの宣言の値は無く、置いても何も変わらない。向け先が無い所（ステージの外で見るだけに描くページの中）では、どの範囲の値も置けない（読むことはできる）。
// スクリーンごとの宣言は、スクリーンの id を渡して名指せる（スクリーンを並べるスクリーンアレンジメントのウィジェットが、並べる 1 枚ごとの値を読み書きするとき）
type At<Sc extends PluginStateScope> = Sc extends "screen" ? [screen?: string] : []

// 宣言の範囲 scope の値がある場所の id（窓の範囲は ""。場所が無ければ null）。given は、呼び出しに渡されたスクリーンの id
function usePluginPlace(
  scope: PluginStateScope,
  use: "read" | "write" = "read",
): (given: string | undefined) => string | null {
  const here = useScope()
  const closed = use === "write" && here.actsOn.kind === "none" // 向け先が無い所からは、どの範囲の値も書かない
  const stage = useStageId()
  const screen = useScreenContext()?.id ?? (here.actsOn.kind === "screen" ? here.actsOn.screen : null)
  return useCallback(
    given => (closed ? null : scope === "window" ? "" : scope === "screen" ? (given ?? screen) : stage),
    [scope, stage, screen, closed],
  )
}

// プラグイン状態 def の今の値（無ければ undefined）。自分の kit を渡し、自分の宣言だけを読む（ほかのプラグインの宣言は E125）。置き直すたびに描き直す
export function usePluginState<S, Sc extends PluginStateScope>(
  kit: Owner,
  def: PluginStateDef<S> & { scope: Sc },
  ...at: At<Sc>
): S | undefined {
  return usePluginStateAt(kit, def, usePluginPlace(def.scope)(at[0]))
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
      const at = placeOf(given[0])
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
  const placeOf = usePluginPlace(def.scope, "write")
  const named = def.scope === "screen"
  return useCallback(
    (...args: unknown[]) => {
      const at = placeOf(named && args.length === 2 ? (args[0] as string) : undefined)
      if (at !== null) set(at, args[args.length - 1] as S | undefined)
    },
    [set, placeOf, named],
  )
}

// ほかのプラグインの宣言に値を入れる関数（宣言の id と値。画面の場所に入れる宣言＝address を持つ宣言だけが受ける。形は土台が宣言の形で確かめる）。入れたら true、
// 宣言が無い・address が無い・形に合わない値・場所の無い範囲は何もせず false。
// スクリーンごとの宣言は、at.screenDef（書き先のスクリーンの定義の id）の開いているスクリーンの値（複数なら最後にカレントにした 1 枚。開いていなければ false）。
// screenDef を渡さなければ、このビューがいるスクリーンの値（スクリーンの外の物は false。窓のカレントスクリーンには落とさない）。
// ステージごとの宣言は、向け先のステージの値（向け先がステージでなければ false）。
// 同じ値なら何も変わらず、ブラウザの履歴に積まない。ほかのプラグインのコードは読まず、id の文字と値だけで頼む（自分の宣言は useSetPluginState）
export function useSetPluginStateById(): (id: string, value: unknown, at?: { screenDef?: string }) => boolean {
  const { setPluginStateById } = useInstance()
  const here = useScreenContext()?.id
  const stage = useStageId()
  const nowhere = useScope().actsOn.kind === "none"
  return useCallback(
    (id, value, at) =>
      !nowhere &&
      setPluginStateById(id, value, {
        ...(here !== undefined ? { screen: here } : {}),
        ...(stage !== null ? { stage } : {}),
        ...(at?.screenDef !== undefined ? { screenDef: at.screenDef } : {}),
      }),
    [setPluginStateById, here, stage, nowhere],
  )
}

// 複数のプラグイン状態の値を、1 回で書く関数（途中の、片方だけ変わった状態を知らせない）。自分の kit を渡し、自分の宣言だけを書く。
// 変え方は [宣言, 新しい値] の並び（ステージごとの宣言は向け先のステージ、スクリーンごとの宣言は描いているスクリーンの値。その場所が無ければ、その変え方は捨てる）
export function useSetPluginStates(
  kit: Owner,
): (changes: readonly (readonly [def: PluginStateDef<unknown>, value: unknown])[]) => void {
  const { setPluginStates } = useInstance()
  const id = kit.id
  const here = useScope()
  const stage = useStageId()
  const screen = useScreenContext()?.id ?? (here.actsOn.kind === "screen" ? here.actsOn.screen : null)
  const nowhere = here.actsOn.kind === "none"
  return useCallback(
    changes =>
      !nowhere &&
      setPluginStates(
        changes.flatMap(([def, value]) => {
          const at = def.scope === "window" ? null : def.scope === "screen" ? screen : stage
          if (def.scope !== "window" && at === null) return []
          return [[ownedPluginState(id, def).id, at, value] as const]
        }),
      ),
    [setPluginStates, id, stage, screen, nowhere],
  )
}

// プラグイン状態 def の値を、今の値から change が返す値にする関数（引数が change。場所が無ければ何もしない）
export function useUpdatePluginState<S, Sc extends PluginStateScope>(
  kit: Owner,
  def: PluginStateDef<S> & { scope: Sc },
): (...args: [...At<Sc>, (now: S | undefined) => S | undefined] | [(now: S | undefined) => S | undefined]) => void {
  const update = useUpdatePluginStateAt(kit, def)
  const placeOf = usePluginPlace(def.scope, "write")
  const named = def.scope === "screen"
  return useCallback(
    (...args: unknown[]) => {
      const at = placeOf(named && args.length === 2 ? (args[0] as string) : undefined)
      if (at !== null) update(at, args[args.length - 1] as (now: S | undefined) => S | undefined)
    },
    [update, placeOf, named],
  )
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

// 向け先のステージが開いているブックにアクションを行う関数（ブック・ページ・アノテーションが対象でないアクションは、ブックを渡さずに行う）。データを変える入口はこれだけ。
// ページとページのアノテーションが対象のアクションは、宛先のページを on に渡す（そのブックのページだけ。そのブックに無いページなら no-page を返す）。
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
  const book = useMatomezuState(s => (at === null ? undefined : stageIn(s.window, at)?.opened?.book))
  const mode = useMatomezuState(s => (at === null ? undefined : stageIn(s.window, at)?.mode.kind) ?? "edit")
  return useMemo(
    () =>
      <Id extends ActionId>(action: Id, args: ArgsOf<Id>, ...[on]: [on?: { page: string }]): Performed<Id> => {
        const loose = perform as (id: string, args: unknown, on?: ActionOn) => Performed<Id>
        if (at === null) return { ok: false, reason: "no-book" } // 向け先が無い所からは、何も行わない
        if (stageBlocks(catalog, mode, action)) return { ok: false, reason: "print-preview" }
        const target = catalog.actions.get(action)?.target
        if (!isInBook(target)) return loose(action, args)
        if (book === undefined) return { ok: false, reason: "no-book" }
        if (!isOnPage(target)) return loose(action, args, { book })
        const held = read().books[book]
        return on && held && findPage(held, on.page) ? loose(action, args, on) : noPage(on?.page ?? "")
      },
    [perform, catalog, book, mode, at, read],
  )
}

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

// 描いている場所のスクリーン（定義 def のスクリーンの中のビューが使う）: 渡された値・見えているか・カレントスクリーンか（定義を問わず見えているか・カレントスクリーンかだけを知るなら useScreenHere）。
// スクリーンの外や、ほかの定義のスクリーンの中で呼べば E126
export function useScreen<P>(def: { id: string; props: PropsShape<P> }): {
  props: P
  shown: boolean
  current: boolean
} {
  const here = useScreenContext()
  if (here === null || here.def !== def.id) fail("E126", { screen: def.id })
  const { props, shown, current } = here
  return useMemo(() => ({ props: props as P, shown, current }), [props, shown, current])
}

// 描いている場所のスクリーンが、見えているか・カレントスクリーンか（定義を問わない。スクリーンの定義を持たないビューが、自分のいるスクリーンを知るのに使う）。
// スクリーンの外（窓の枠のウィジェットなど）で呼べば null
export function useScreenHere(): { shown: boolean; current: boolean } | null {
  const here = useScreenContext()
  const shown = here?.shown
  const current = here?.current
  return useMemo(() => (shown === undefined || current === undefined ? null : { shown, current }), [shown, current])
}

// スクリーンを開く・描いている場所のスクリーンを閉じる・渡す値を替える。描いている場所のスクリーンは、スクリーンの外（窓の枠のウィジェットなど）ならカレントスクリーン。
// - open: 定義 def のスクリーンを 1 枚開いてカレントスクリーンにする（値が定義の形に合わなければ開かず false）
// - setProps: 描いている場所のスクリーンに渡す値を替える（スクリーンは積まず、ブラウザの履歴には積む。そのスクリーンが定義 def の物でないか、値が形に合わなければ替えず false）
// - close: 描いている場所のスクリーンを閉じる（最初から開いているスクリーンの最後の 1 枚は閉じない）
// ほかのスクリーンを名指す操作は、スクリーンアレンジメントのウィジェットの中だけ（useArrangedScreens）
export function useScreens(): {
  open<P>(def: { id: string; props: PropsShape<P> }, props: P): boolean
  setProps<P>(def: { id: string; props: PropsShape<P> }, props: P): boolean
  close(): void
} {
  const here = useScreenContext()?.id ?? null
  const read = useReadState()
  const { openScreen, setScreenProps, closeScreen } = useStoreActions()
  return useMemo(() => {
    const at = () => here ?? currentScreen(read().window).id
    return {
      open: <P>(def: { id: string; props: PropsShape<P> }, props: P) => openScreen(def.id, props),
      setProps: <P>(def: { id: string; props: PropsShape<P> }, props: P) => {
        const screen = at()
        if (read().window.screens.find(s => s.id === screen)?.def !== def.id) return false
        return setScreenProps(screen, props)
      },
      close: () => closeScreen(at()),
    }
  }, [here, read, openScreen, setScreenProps, closeScreen])
}

// スクリーンアレンジメントのウィジェットが並べるスクリーン: 開いているスクリーンの並び（開いた順。1 枚ごとの id・定義の id・渡された値・見えているか・カレントスクリーンか）と、
// スクリーンアレンジメントの値と、カレントスクリーンにする・閉じる（どれもスクリーンを id で名指す）。スクリーンアレンジメントのウィジェットの中でだけ呼べる（外なら E128。
// その中に描いたスクリーンの中も外）。1 枚を描くのは ScreenView
export function useArrangedScreens(): {
  screens: readonly { id: string; def: string; props: unknown; shown: boolean; current: boolean }[]
  value: unknown
  makeCurrent(id: string): void
  close(id: string): void
} {
  if (!useArranged()) fail("E128", { name: "useArrangedScreens" })
  const catalog = useCoreCatalog()
  const opened = useMatomezuState(s => s.window.screens)
  const current = useMatomezuState(s => currentScreen(s.window).id)
  const shown = useMatomezuState(useShallow(s => shownScreens(catalog, s.window)))
  const value = useMatomezuState(s => s.window.arrangementValue)
  const { makeScreenCurrent, closeScreen } = useStoreActions()
  return useMemo(
    () => ({
      screens: opened.map(s => ({
        id: s.id,
        def: s.def,
        props: s.props,
        shown: shown.includes(s.id),
        current: s.id === current,
      })),
      value,
      makeCurrent: makeScreenCurrent,
      close: closeScreen,
    }),
    [opened, current, shown, value, makeScreenCurrent, closeScreen],
  )
}

// 窓のスクリーンアレンジメント: 今の定義の id と、替える（定義と値。値を渡さなければ定義の初めの値。値は定義の value の形で、合わなければ替えない）。
// 値は並べるスクリーンを名指すので、読むのはスクリーンアレンジメントのウィジェットだけ（useArrangedScreens）
export function useScreenArrangement(): {
  id: string
  set<V>(def: { id: string; value?: { schema: { parse(v: unknown): V } } }, value?: V): void
} {
  const id = useMatomezuState(s => s.window.arrangement)
  const { setScreenArrangement } = useStoreActions()
  const set = useCallback(
    <V>(def: { id: string }, value?: V) => setScreenArrangement(def.id, value),
    [setScreenArrangement],
  )
  return useMemo(() => ({ id, set }), [id, set])
}

// 同じ同期の処理の中の窓の変わりを、ブラウザの履歴に積まずに書き換えてほしいと頼む関数（利用者の操作でない変わり。窓の大きさでスクリーンアレンジメントを戻すなど）
export function useReplaceHistory(): () => void {
  return useStoreActions().replaceHistory
}

// ブラウザの履歴を 1 つ戻す（ブラウザの戻るボタンと同じ。ブック・ページ・スクリーンの移動を、積んだ順に戻る）。
// canGoBack は、この窓の中に戻る先があるか（無いときの goBack は何もしない。窓の外へは出ない）
export function useBrowserBack(): { canGoBack: boolean; goBack(): void } {
  const canGoBack = useMatomezuState(s => s.canGoBack)
  const { requestBack } = useStoreActions()
  return { canGoBack, goBack: requestBack }
}
