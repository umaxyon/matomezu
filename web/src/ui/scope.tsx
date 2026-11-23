// 描いている場所: ビューのまわりに置く、描くページと、操作の向け先の組。提供はこの 1 つだけで、ページと向け先は必ず一緒に置く
// （ステージの外で見るだけに描くページを置くと、外のステージの向け先は必ず消える。別々に置けないので、食い違わない）。
//   ステージ: 描くページはそのステージが開いている物、向け先はそのステージ（StageScope）
//   ステージの外で見るだけに描くページ: 描くページは渡されたブックのページ、向け先は無し（PageScope。ページ一覧のサムネイル・スクラップの中・印刷プレビューの印刷区画）
//   スクリーン: 描くページは無く、向け先はそのスクリーン（ステージを持たないスクリーンから開いたダイアログなど。ActsOnScope）
//   何も置いていない所: 描いているスクリーン（ui/screen-context.tsx）が向け先。スクリーンの外（窓の根）なら窓
// フック（ui/view-hooks.ts など）は、読む物を描くページから、操作を向け先から引く。向け先が無い所からは、何も行えない。
// コンテキストの値は id と数だけで、同じ場所の間は同じ参照（ブックやページの中身・選択・紙をずらす量は入れない。変わるたびに中の全部を描き直さないため）
import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react"
import type { PageTypeId } from "../core/catalog"
import { pageIn } from "../core/folders"
import { outsideBinderIn } from "../core/folders-tree"
import type { ItemPage } from "../core/placed"
import type { BinderEntry, Book } from "../core/schema/book"
import { NO_PAGE, NO_STAGE, NOTHING_OPENED, type Stage, shownPageId } from "../core/stage"
import { stageIn } from "../core/window"
import type { MatomezuState } from "../store/state"
import { useScreenIdHere } from "./screen-context"
import { useMatomezuState, useReadState } from "./store-context"

// 操作の向け先: ステージ・スクリーン・窓（スクリーンの外の、何も置いていない所）・無し（見るだけ）
export type ActsOn =
  | { kind: "stage"; stage: string }
  | { kind: "screen"; screen: string }
  | { kind: "window" }
  | { kind: "none" }

// 描くページの在り処（中身は ui の中だけで解く。プラグイン API には出さない）:
// ステージが開いている物か、ブック book のページ page を倍率 zoom（画面の 1px に描く紙の大きさの比）で描く物
type PageRef = { from: "stage"; stage: string } | { from: "page"; outermost: string; page: string; zoom: number }

export interface Scope {
  page: PageRef | null
  actsOn: ActsOn
}

const NONE: ActsOn = { kind: "none" }
const WINDOW: ActsOn = { kind: "window" }
const ScopeContext = createContext<Scope | null>(null)

// ステージ stage の中: 描くページはそのステージが開いている物、向け先はそのステージ
export function StageScope({ stage, children }: { stage: string; children: ReactNode }) {
  const scope = useMemo<Scope>(() => ({ page: { from: "stage", stage }, actsOn: { kind: "stage", stage } }), [stage])
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

// ステージの外で見るだけに描くページ: ステージエントリ outermost（ブックか、ブックの外のページ・バインダの id）のページ page を倍率 zoom で描く。中からは何も行えない（外がステージでも、向け先は無しになる）
export function PageScope({
  outermost,
  page,
  zoom,
  children,
}: {
  outermost: string
  page: string
  zoom: number
  children: ReactNode
}) {
  const scope = useMemo<Scope>(
    () => ({ page: { from: "page", outermost, page, zoom }, actsOn: NONE }),
    [outermost, page, zoom],
  )
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

// 開いた場所 at（ステージの id か、スクリーンの id。ダイアログを開いた所・右クリックのメニューが持つ値）の中: 開いているスクリーンの id ならそのスクリーン、
// ほかはステージを向け先にする（もう無いステージなら、中からは何も行えない。useStageId・useAt が見る）
export function ActsOnScope({ at, children }: { at: string; children: ReactNode }) {
  const isScreen = useMatomezuState(s => s.window.screens.some(x => x.id === at))
  const scope = useMemo<Scope>(
    () =>
      isScreen
        ? { page: null, actsOn: { kind: "screen", screen: at } }
        : { page: { from: "stage", stage: at }, actsOn: { kind: "stage", stage: at } },
    [at, isScreen],
  )
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

// 描いている場所（何も置いていなければ、描いているスクリーン。その外なら窓）
export function useScope(): Scope {
  const placed = useContext(ScopeContext)
  const screen = useScreenIdHere()
  return useMemo<Scope>(
    () =>
      placed ??
      (screen === undefined ? { page: null, actsOn: WINDOW } : { page: null, actsOn: { kind: "screen", screen } }),
    [placed, screen],
  )
}

// 向け先のステージの id（向け先がステージでないか、そのステージがもう無ければ NO_STAGE）
export function useStageId(): string {
  const { actsOn } = useScope()
  const stage = actsOn.kind === "stage" ? actsOn.stage : NO_STAGE
  const there = useMatomezuState(s => stage !== NO_STAGE && stageIn(s.window, stage) !== undefined)
  return there ? stage : NO_STAGE
}

// store の操作・コマンドに渡す、呼ぶ場所の値（ステージの id・スクリーンの id・窓は NO_STAGE）。向け先が無いか、向け先のステージがもう無ければ null
export function useAt(): string | null {
  const { actsOn } = useScope()
  const stage = useStageId() // 向け先がステージで、まだあるときだけ id
  if (actsOn.kind === "stage") return stage === NO_STAGE ? null : stage
  return actsOn.kind === "screen" ? actsOn.screen : actsOn.kind === "window" ? NO_STAGE : null
}

// 描くページの、ステージエントリの id とページの id（描くページが無ければ null。ページを開いていなければ page は null）
export function openedOf(s: MatomezuState, scope: Scope): { outermost: string; page: string | null } | null {
  const ref = scope.page
  if (!ref) return null
  if (ref.from === "page") return { outermost: ref.outermost, page: ref.page }
  const opened = stageIn(s.window, ref.stage)?.opened
  if (opened === undefined || opened === NOTHING_OPENED) return null
  const page = shownPageId(opened)
  return { outermost: opened.outermost.id, page: page === NO_PAGE ? null : page }
}

// 描くページのブック（無ければ null）
export function bookOf(s: MatomezuState, scope: Scope): Book | null {
  const o = openedOf(s, scope)
  return o ? (s.books[o.outermost] ?? null) : null
}

// 描くページのステージエントリが、開けるブックの外のバインダなら、そのバインダ（中のページごと。ブック・ブックの外のページ・描くページが無ければ null）
export function outsideBinderOf(s: MatomezuState, scope: Scope): BinderEntry | null {
  const o = openedOf(s, scope)
  return (o && outsideBinderIn(s, o.outermost)) ?? null
}

// 描くページ（ページを開いていなければ null）
export function pageOf(s: MatomezuState, scope: Scope): ItemPage | null {
  const page = openedOf(s, scope)?.page
  return (page && pageIn(s.pages, page)) || null
}

// 描くページのタイプ（描くページが無ければ undefined）
export function pageTypeOf(s: MatomezuState, scope: Scope): PageTypeId | undefined {
  return pageOf(s, scope)?.type as PageTypeId | undefined
}

// 描くページの倍率（ステージの外で見るだけに描くページは渡された倍率、ステージはそのステージの倍率。描くページが無ければ null）
export function zoomOf(s: MatomezuState, scope: Scope): number | null {
  const ref = scope.page
  if (!ref) return null
  return ref.from === "page" ? ref.zoom : (stageIn(s.window, ref.stage)?.zoom ?? null)
}

// 描くページの今の倍率（描くページが無ければ 1）
export function useZoomHere(): number {
  const scope = useScope()
  return useMatomezuState(s => zoomOf(s, scope)) ?? 1
}

// 向け先のステージの素の状態（向け先がステージでないか、もう無ければ null）と窓の状態から、pick が選んだ物を読む。
// 土台と base だけが使う（プラグイン API には出さない。プラグインのビューは ui/view-hooks.ts などのフックで約束の物だけを引く）
export function useStageHere<T>(pick: (stage: Stage | null, s: MatomezuState) => T): T {
  const id = useStageId()
  return useMatomezuState(s => pick(id === NO_STAGE ? null : (stageIn(s.window, id) ?? null), s))
}

// 向け先のステージの今の素の状態を返す関数（描き直さない。イベントや effect の中で使う）
export function useReadStageHere(): () => Stage | null {
  const id = useStageId()
  const read = useReadState()
  return useCallback(() => (id === NO_STAGE ? null : (stageIn(read().window, id) ?? null)), [read, id])
}
