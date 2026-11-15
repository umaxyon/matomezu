// 描いている場所: ビューのまわりに置く、描くページと、操作の向け先の組。提供はこの 1 つだけで、ページと向け先は必ず一緒に置く
// （見るだけのページを置くと、外のステージの向け先は必ず消える。別々に置けないので、食い違わない）。
//   ステージ: 描くページはそのステージが開いている物、向け先はそのステージ（StageScope）
//   見るだけのページ: 描くページは渡されたブックのページ、向け先は無し（PageScope。ページ一覧のサムネイル・スクラップの中・印刷プレビューの区画）
//   スクリーン: 描くページは無く、向け先はそのスクリーン（ステージを持たないスクリーンから開いたダイアログなど。ActsOnScope）
//   何も置いていない所: 描いているスクリーン（ui/screen-context.tsx）が向け先。スクリーンの外（窓の根）なら窓
// フック（ui/view-hooks.ts など）は、読む物を描くページから、操作を向け先から引く。向け先が無い所からは、何も行えない。
// コンテキストの値は id と数だけで、同じ場所の間は同じ参照（ブックやページの中身・選択・紙をずらす量は入れない。変わるたびに中の全部を描き直さないため）
import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react"
import { pagedOf } from "../core/book"
import type { BookTypeId } from "../core/catalog"
import type { ItemPage } from "../core/placed"
import type { Book } from "../core/schema/book"
import type { Stage } from "../core/stage"
import { stageIn } from "../core/window"
import { NO_STAGE } from "../store/dialogs"
import type { MatomezuState } from "../store/store"
import { useScreenHere } from "./screen-context"
import { useMatomezuState, useReadState } from "./store-context"

// 操作の向け先: ステージ・スクリーン・窓（スクリーンの外の、何も置いていない所）・無し（見るだけ）
export type ActsOn =
  | { kind: "stage"; stage: string }
  | { kind: "screen"; screen: string }
  | { kind: "window" }
  | { kind: "none" }

// 描くページの在り処（中身は ui の中だけで解く。プラグイン API には出さない）:
// ステージが開いている物か、ブック book のページ page を倍率 zoom（画面の 1px に描く紙の大きさの比）で描く物
type PageRef = { from: "stage"; stage: string } | { from: "page"; book: string; page: string; zoom: number }

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

// 見るだけのページ: ブック book のページ page を倍率 zoom で描く。中からは何も行えない（外がステージでも、向け先は無しになる）
export function PageScope({
  book,
  page,
  zoom,
  children,
}: {
  book: string
  page: string
  zoom: number
  children: ReactNode
}) {
  const scope = useMemo<Scope>(() => ({ page: { from: "page", book, page, zoom }, actsOn: NONE }), [book, page, zoom])
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

// 開いた場所 at（ステージの id か、スクリーンの id。store のダイアログ・右クリックのメニューが持つ値）の中: 開いているスクリーンの id ならそのスクリーン、
// ステージを持たずに開いた印（NO_STAGE）なら窓、ほかはステージを向け先にする（もう無いステージなら、中からは何も行えない。useStageId・useAt が見る）
export function ActsOnScope({ at, children }: { at: string; children: ReactNode }) {
  const isScreen = useMatomezuState(s => s.window.screens.some(x => x.id === at))
  const scope = useMemo<Scope>(
    () =>
      at === NO_STAGE
        ? { page: null, actsOn: WINDOW }
        : isScreen
          ? { page: null, actsOn: { kind: "screen", screen: at } }
          : { page: { from: "stage", stage: at }, actsOn: { kind: "stage", stage: at } },
    [at, isScreen],
  )
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

// 描いている場所（何も置いていなければ、描いているスクリーン。その外なら窓）
export function useScope(): Scope {
  const placed = useContext(ScopeContext)
  const screen = useScreenHere()?.id
  return useMemo<Scope>(
    () =>
      placed ??
      (screen === undefined ? { page: null, actsOn: WINDOW } : { page: null, actsOn: { kind: "screen", screen } }),
    [placed, screen],
  )
}

// 向け先のステージの id（向け先がステージでないか、そのステージがもう無ければ null）
export function useStageId(): string | null {
  const { actsOn } = useScope()
  const stage = actsOn.kind === "stage" ? actsOn.stage : null
  const there = useMatomezuState(s => stage !== null && stageIn(s.window, stage) !== undefined)
  return there ? stage : null
}

// store の操作・コマンドに渡す、呼ぶ場所の値（ステージの id・スクリーンの id・窓は NO_STAGE）。向け先が無いか、向け先のステージがもう無ければ null
export function useAt(): string | null {
  const { actsOn } = useScope()
  const stage = useStageId() // 向け先がステージで、まだあるときだけ id
  if (actsOn.kind === "stage") return stage
  return actsOn.kind === "screen" ? actsOn.screen : actsOn.kind === "window" ? NO_STAGE : null
}

// 描くページの、ブックの id とページの id（描くページが無ければ null。ページを開いていなければ page は null）
export function openedOf(s: MatomezuState, scope: Scope): { book: string; page: string | null } | null {
  const ref = scope.page
  if (!ref) return null
  if (ref.from === "page") return { book: ref.book, page: ref.page }
  return stageIn(s.window, ref.stage)?.opened ?? null
}

// 描くページのブック（無ければ null）
export function bookOf(s: MatomezuState, scope: Scope): Book | null {
  const o = openedOf(s, scope)
  return o ? (s.books[o.book] ?? null) : null
}

// 描くページ（ページを持たないブック・ページを開いていなければ null）
export function pageOf(s: MatomezuState, scope: Scope): ItemPage | null {
  const o = openedOf(s, scope)
  const book = o ? pagedOf(s.books[o.book]) : undefined
  return (book?.pages.find(p => p.id === o?.page) as ItemPage | undefined) ?? null
}

// 描くページのブックのタイプ（描くページが無ければ undefined）
export function bookTypeOf(s: MatomezuState, scope: Scope): BookTypeId | undefined {
  const ref = scope.page
  if (!ref) return undefined
  return ref.from === "page" ? s.books[ref.book]?.type : stageIn(s.window, ref.stage)?.opened?.type
}

// 描くページの倍率（見るだけのページは渡された倍率、ステージはそのステージの倍率。描くページが無ければ null）
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
// 土台と base だけが使う（プラグイン API には出さない。プラグインのビューは ui/view-hooks.ts のフックで約束の物だけを引く）
export function useStageHere<T>(pick: (stage: Stage | null, s: MatomezuState) => T): T {
  const id = useStageId()
  return useMatomezuState(s => pick(id === null ? null : (stageIn(s.window, id) ?? null), s))
}

// 向け先のステージの今の素の状態を返す関数（描き直さない。イベントや effect の中で使う）
export function useReadStageHere(): () => Stage | null {
  const id = useStageId()
  const read = useReadState()
  return useCallback(() => (id === null ? null : (stageIn(read().window, id) ?? null)), [read, id])
}
