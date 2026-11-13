// プラグインの見た目が使うフック（matomezu/ui）: matomezu が渡すステージの id から、約束のものだけを引く。状態を丸ごとは見せない。
// データはブック・ページ・アイテム、ステージは読むだけの StageView（プラグインが持つ状態は usePluginState・useSetPluginState）、ほかに機能台帳と利用者の設定。データを変える入口は usePerform（アクション）だけ
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
import { currentScreen, shownScreens, stageIn, workspaceOf } from "../core/window"
import { type StageView, stageView, toolOf } from "../core/workspace"
import { NO_STAGE } from "../store/dialogs"
import type { PluginKit } from "../store/kit"
import { ownedPluginState, pluginValueOf } from "../store/plugin-state"
import type { Performed } from "../store/store"
import { worldOf } from "../store/world"
import type { UiCatalog } from "./plugin"
import { useScreenHere } from "./screen-context"
import {
  useActions,
  useCatalog,
  useControlCenter,
  useInstance,
  useMatomezuState,
  useReadState,
  useUiCatalog as useUi,
} from "./store-context"

// そのステージが開いているブック（何も開いていなければ null）
export function useBook(stage: string): Book | null {
  return useMatomezuState(s => {
    const o = stageIn(s.window, stage)?.opened
    return o ? (s.books[o.book] ?? null) : null
  })
}

// そのステージが開いているページ（ページを持たないブック・ページを開いていなければ null）
export function usePage(stage: string): ItemPage | null {
  return useMatomezuState(s => {
    const o = stageIn(s.window, stage)?.opened
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
    const o = stageIn(s.window, stage)?.opened
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
  const book = useMatomezuState(s => stageIn(s.window, stage)?.opened?.book)
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
  const controlCenter = useControlCenter()
  const settings = where && "settings" in where ? where.settings.join("\n") : undefined
  const place = where && !("settings" in where) ? where : undefined
  const ids = place?.ids?.join("\n")
  const answer = useMatomezuState(s => {
    const st = stageIn(s.window, stage)
    if (st && stageBlocks(catalog, st.mode.kind, action)) return NOT_ALLOWED
    const o = st?.opened
    const book = o ? s.books[o.book] : undefined
    const page = place?.page ?? o?.page ?? undefined
    const at = { ...(page ? { page } : {}), ...(ids ? { ids: ids.split("\n") } : {}) }
    const changed = settings === undefined ? {} : { settings: settings === "" ? [] : settings.split("\n") }
    const done = inspect(catalog, { ...actionQuery(catalog, action, book, at), ...changed }, { controlCenter })
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

// そのステージ（読むだけ。無いステージなら null）。紙をずらしただけでは描き直さない
export function useStage(stage: string): StageView | null {
  const catalog = useCatalog().core
  const found = useMatomezuState(
    useShallow(s => {
      const st = stageIn(s.window, stage)
      return st
        ? {
            id: st.id,
            opened: st.opened,
            zoom: st.zoom,
            selection: st.selection,
            editing: st.editing,
            placing: st.placing,
            edits: st.edits,
            mode: st.mode,
          }
        : null
    }),
  )
  const tool = useMatomezuState(s => toolOf(catalog, workspaceOf(s.window, stage), stage, s.books))
  return useMemo(() => (found ? stageView(catalog, found, tool) : null), [catalog, found, tool])
}

// プラグイン状態の持ち主（プラグインの kit。kit の id が頭の宣言だけを読み書きする。id だけの物は受けない）
// biome-ignore lint/suspicious/noExplicitAny: どのプラグインの kit も受ける（文言の表の型は見ない）
type Owner = PluginKit<string, any>

// ステージごとの宣言は、読み書きするステージ stage を呼び出しに渡す（ステージに結ばない宣言は渡さない）
// 値のある場所: ステージごとの宣言はステージの id、スクリーンごとの宣言は開いているスクリーンの id（useScreen が返す自分の id など）
type At<Sc extends PluginStateScope> = Sc extends "stage"
  ? [stage: string]
  : Sc extends "screen"
    ? [screen: string]
    : []

// プラグイン状態 def の今の値（無ければ undefined）。自分の kit を渡し、自分の宣言だけを読む（ほかのプラグインの宣言は E125）。
// ステージごとの宣言は読むステージ stage も渡す。置き直すたびに描き直す
export function usePluginState<S>(kit: Owner, def: PluginStateDef<S> & { scope: "window" }): S | undefined
export function usePluginState<S>(kit: Owner, def: PluginStateDef<S> & { scope: "stage" }, stage: string): S | undefined
export function usePluginState<S>(
  kit: Owner,
  def: PluginStateDef<S> & { scope: "screen" },
  screen: string,
): S | undefined
export function usePluginState<S>(kit: Owner, def: PluginStateDef<S>, stage = ""): S | undefined {
  const own = ownedPluginState(kit.id, def)
  return useMatomezuState(s => pluginValueOf(s.pluginValues, stage, own))
}

// プラグイン状態 def を、描き直さずに読む関数（置いた側が、前に置いた値と比べるときなど。ステージごとの宣言は、読むステージを呼び出しに渡す）
export function useReadPluginState<S, Sc extends PluginStateScope>(
  kit: Owner,
  def: PluginStateDef<S> & { scope: Sc },
): (...at: At<Sc>) => S | undefined {
  const read = useReadState()
  const own = ownedPluginState(kit.id, def)
  return useCallback((...at: string[]) => pluginValueOf(read().pluginValues, at[0] ?? "", own), [read, own])
}

// プラグイン状態 def の値を変える関数（最後の引数が新しい値。undefined なら消す。ステージごとの宣言は、先頭にステージを渡す。無いステージには置かない。
// 画面の場所に入れる宣言の形に合わなければ E123）
export function useSetPluginState<S, Sc extends PluginStateScope>(
  kit: Owner,
  def: PluginStateDef<S> & { scope: Sc },
): (...args: [...At<Sc>, S | undefined]) => void {
  const { setPluginState } = useInstance()
  const own = ownedPluginState(kit.id, def)
  return useCallback(
    (...args: unknown[]) =>
      setPluginState(own.id, own.scope === "window" ? null : (args[0] as string), args[args.length - 1]),
    [setPluginState, own],
  )
}

// 複数のプラグイン状態の値を、1 回で書く関数（途中の、片方だけ変わった状態を知らせない）。自分の kit を渡し、自分の宣言だけを書く。
// 変え方は [宣言, ステージ（ステージに結ばない宣言は null）, 新しい値] の並び
export function useSetPluginStates(
  kit: Owner,
): (changes: readonly (readonly [def: PluginStateDef<unknown>, stage: string | null, value: unknown])[]) => void {
  const { setPluginStates } = useInstance()
  const id = kit.id
  return useCallback(
    changes =>
      setPluginStates(changes.map(([def, stage, value]) => [ownedPluginState(id, def).id, stage, value] as const)),
    [setPluginStates, id],
  )
}

// プラグイン状態 def の値を、今の値から change が返す値にする関数（最後の引数が change。ステージごとの宣言は、先頭にステージを渡す）
export function useUpdatePluginState<S, Sc extends PluginStateScope>(
  kit: Owner,
  def: PluginStateDef<S> & { scope: Sc },
): (...args: [...At<Sc>, (now: S | undefined) => S | undefined]) => void {
  const { setPluginState } = useInstance()
  const read = useReadState()
  const own = ownedPluginState(kit.id, def)
  return useCallback(
    (...args: unknown[]) => {
      const stage = own.scope === "window" ? null : (args[0] as string)
      const change = args[args.length - 1] as (now: S | undefined) => S | undefined
      setPluginState(own.id, stage, change(pluginValueOf(read().pluginValues, stage ?? "", own)))
    },
    [setPluginState, read, own],
  )
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
  return useMatomezuState(s => (watch ? (stageIn(s.window, stage)?.pan ?? null) : null))
}

// 表示領域の中の点（左上から）を、そのステージの今の紙の上の点に直す関数（描き直さない。押した所を直すときなど、イベントや effect の中で使う）
export function useToPaper(stage: string): (p: Point) => Point | null {
  const read = useReadState()
  return useCallback(
    (p: Point) => {
      const st = stageIn(read().window, stage)
      return st ? toPaper(st, p) : null
    },
    [read, stage],
  )
}

// そのステージの今の紙をずらす量を読む関数（描き直さない。押した所を紙の上の点に直すときなど、イベントや effect の中で読む）
export function useLatestPan(stage: string): () => Point | null {
  const read = useReadState()
  return useCallback(() => stageIn(read().window, stage)?.pan ?? null, [read, stage])
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

// そのステージが開いているブックにアクションを行う関数（ブックかアノテーションが対象でないアクションは、ブックを渡さずに行う）。データを変える入口はこれだけ。
// 印刷プレビューの間のステージからは、ブックを変えるアクションを行わず print-preview を返す（core/stage.ts の stageBlocks）
export function usePerform(stage: string): <Id extends ActionId>(action: Id, args: ArgsOf<Id>) => Performed<Id> {
  const { perform } = useActions()
  const catalog = useCatalog().core
  const book = useMatomezuState(s => stageIn(s.window, stage)?.opened?.book)
  const mode = useMatomezuState(s => stageIn(s.window, stage)?.mode.kind ?? "edit")
  return useMemo(
    () =>
      <Id extends ActionId>(action: Id, args: ArgsOf<Id>): Performed<Id> => {
        const loose = perform as (id: string, args: unknown, on?: ActionOn) => Performed<Id>
        if (stageBlocks(catalog, mode, action)) return { ok: false, reason: "print-preview" }
        if (!isOnBook(catalog.actions.get(action)?.target)) return loose(action, args)
        return book === undefined ? { ok: false, reason: "no-book" } : loose(action, args, { book })
      },
    [perform, catalog, book, mode],
  )
}

// 描いている場所のスクリーンの id（スクリーンの外で描いているなら none）。ステージを持たない所から、ダイアログを開く（openDialog）・コマンドを呼ぶ（useCommand）・
// 行えるかを問う（useAllowed）ときに、ステージの id の代わりに渡す
export const useScreenId = (): string => useScreenHere()?.id ?? NO_STAGE

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
  makeCurrent(id: string): void
  close(id: string): void
} {
  const catalog = useCoreCatalog()
  const opened = useMatomezuState(s => s.window.screens)
  const current = useMatomezuState(s => currentScreen(s.window).id)
  const shown = useMatomezuState(useShallow(s => shownScreens(catalog, s.window)))
  const { openScreen, makeScreenCurrent, closeScreen } = useActions()
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
  return { screens, open, makeCurrent: makeScreenCurrent, close: closeScreen }
}
