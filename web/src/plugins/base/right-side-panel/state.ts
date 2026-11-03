// 右サイドパネルを開いているかの、base のステージの画面の状態での持ち方: 開いたステージの rightSidePanel に、出している中身と開いた所を持つ。
// 閉じたときに見え方を戻すための覚えは、rightSidePanelRestore に持つ。
// 窓に 1 つだけで、ブックのデータにも URL にも入れない
import { areaOf, type Stage } from "../../../core/stage"
import { clampPan, contentSize } from "../../../core/viewport"
import type { ViewAt } from "../zoom"

export interface RightSidePanelOpen {
  widget: string // 出している中身（右サイドパネルのスロットに置いたウィジェットの id）
  subject: string // 中身が見せている物の id（伝言なら、その伝言の id）
  anchors: readonly string[] // 見せている物が付いた先（ステージの物の id の並び。選択に従う中身なら、ステージの選択に合わせる）
  current: string // anchors のうち、いま見せている 1 つ（カレント。anchors が空の間は、最後にカレントだった物）
  book: string // 開いたときのブック
  page: string | null // 開いたときのページ
}

// 選択に従う中身の open を、ステージの選択 selection に合わせたもの（同じなら同じ値）。
// カレントは、新しく足された物の最後。足されていなければ今のカレント（選択に残っていれば）、無ければ選択の最後
export function followSelection(open: RightSidePanelOpen, selection: readonly string[]): RightSidePanelOpen {
  const same = selection.length === open.anchors.length && selection.every((id, i) => open.anchors[i] === id)
  if (same) return open
  const added = selection.filter(id => !open.anchors.includes(id))
  const current = added.at(-1) ?? (selection.includes(open.current) ? open.current : (selection.at(-1) ?? open.current))
  return { ...open, anchors: [...selection], current }
}

// base のステージの画面の状態 state の、右サイドパネル（開いていなければ null）
export const panelIn = (state: unknown): RightSidePanelOpen | null =>
  (state as { rightSidePanel?: RightSidePanelOpen } | undefined)?.rightSidePanel ?? null

// base のステージの画面の状態 state の、右サイドパネルを open にしたもの（null なら閉じる）
export function withPanel(state: unknown, open: RightSidePanelOpen | null): Record<string, unknown> {
  const { rightSidePanel: _, ...rest } = (state as Record<string, unknown> | undefined) ?? {}
  return open ? { ...rest, rightSidePanel: open } : rest
}

// 閉じたときに見え方を戻すための覚え: 開く前の見え方とそのブックとページ、開いて物を見せた見え方（まだ見せていなければ null）、
// 開いている間に倍率かずらす量を変えたか（ページを替えれば閉じ、restoreTo が戻さない）。base のステージの画面の状態の rightSidePanelRestore に持ち、
// 閉じて幅を動かし終えたら、変えていなければ戻して消す
export interface RightSidePanelRestore {
  before: ViewAt & { book: string; page: string | null }
  shown: ViewAt | null
  seen: Seen | null // 最後に見せたときの付いた先とカレント（まだ見せていなければ null）
  moved: boolean
}

// 見せた物: 付いた先の並びとカレント
export interface Seen {
  anchors: readonly string[]
  current: string
}

// 付いた先とカレントが open になったとき、どう見せ直すか: 付いた先が替われば、全部を囲む四角を収める（1 つなら 100%）。
// カレントだけが替われば、倍率はそのままでカレントを真ん中へ。どちらも同じなら見せ直さない
export function revealFor(seen: Seen | null, open: Seen): "anchors" | "current" | "none" {
  if (open.anchors.length === 0) return "none"
  if (!seen || seen.anchors.length !== open.anchors.length || seen.anchors.some((id, i) => open.anchors[i] !== id))
    return "anchors"
  return seen.current === open.current ? "none" : "current"
}

export const restoreIn = (state: unknown): RightSidePanelRestore | null =>
  (state as { rightSidePanelRestore?: RightSidePanelRestore } | undefined)?.rightSidePanelRestore ?? null

// 右サイドパネルを open で開いたもの。開く前の見え方は now で、物はまだ見せていない。
// 閉じて戻す前に同じブックとページで開き直したときは、最初に開く前の見え方と、それまでに変えたかをそのまま持つ（一度変えたら、開き直しても戻さない）
export function withOpened(state: unknown, open: RightSidePanelOpen, now: ViewAt): Record<string, unknown> {
  const kept = restoreIn(state)
  const same = kept && kept.before.book === open.book && kept.before.page === open.page
  const restore = same
    ? { before: kept.before, shown: null, seen: null, moved: kept.moved }
    : {
        before: { zoom: now.zoom, pan: now.pan, book: open.book, page: open.page },
        shown: null,
        seen: null,
        moved: false,
      }
  return { ...withPanel(state, open), rightSidePanelRestore: restore }
}

// 戻すための覚えを、change で変えたもの（覚えが無ければそのまま）
export function withRestore(state: unknown, change: Partial<RightSidePanelRestore>): Record<string, unknown> {
  const now = (state as Record<string, unknown> | undefined) ?? {}
  const restore = restoreIn(state)
  return restore ? { ...now, rightSidePanelRestore: { ...restore, ...change } } : now
}

// 戻すための覚えを消したもの
export function withoutRestore(state: unknown): Record<string, unknown> {
  const { rightSidePanelRestore: _, ...rest } = (state as Record<string, unknown> | undefined) ?? {}
  return rest
}

const sameView = (a: ViewAt, b: ViewAt): boolean => a.zoom === b.zoom && a.pan.x === b.pan.x && a.pan.y === b.pan.y

// 開いている間のステージ now で、倍率かずらす量を変えたことになるか。物を見せる前と、表示領域の大きさが変わってずらす量が収め直されただけのときは数えない
// （見せた見え方を今の表示領域で収め直したものと比べる。幅を動かし終えたあとに表示領域の大きさが届くことがあるため）
export function movedFrom(
  restore: RightSidePanelRestore,
  now: Pick<Stage, "zoom" | "pan" | "view" | "opened">,
): boolean {
  if (restore.moved) return true
  const shown = restore.shown
  if (!shown) return false
  const area = areaOf(now)
  const pan = now.view && area ? clampPan(now.view, contentSize(area, shown.zoom), shown.pan) : shown.pan
  return !sameView({ zoom: shown.zoom, pan }, now)
}

// 閉じて幅を動かし終えたときに戻す見え方（開いている間に変えたか、開く前と違うブックかページを開いているか、
// 別のステージで右サイドパネルを開いている（elsewhere）なら戻さず null）
export const restoreTo = (
  restore: RightSidePanelRestore,
  stage: Pick<Stage, "opened">,
  elsewhere = false,
): ViewAt | null =>
  elsewhere ||
  restore.moved ||
  stage.opened?.book !== restore.before.book ||
  (stage.opened?.page ?? null) !== restore.before.page
    ? null
    : { zoom: restore.before.zoom, pan: restore.before.pan }

// 開いたときのブックとページが、今ステージで開いているものと同じか（違えば、右サイドパネルは閉じる）
export const stillOn = (open: RightSidePanelOpen, stage: Pick<Stage, "opened">): boolean =>
  stage.opened?.book === open.book && (stage.opened?.page ?? null) === open.page

// 分けたステージの列の伸び（flex-grow）: 右サイドパネルを開いていれば、開いたステージ panel が 1・もう片方が 0。開いていなければ分けた割合 share
export const columnGrow = (stage: string, i: number, panel: string | null, share: number): number =>
  panel !== null ? (stage === panel ? 1 : 0) : i === 0 ? share : 1 - share

// 押しで右サイドパネルを閉じるか: 左ボタンで、右サイドパネルの外の、閉じない所（ダイアログ・メニューなど）でもない所を、ずらす道具でない間に押したとき。
// 選択に従う中身を出している間の、開いたステージの中の押し（followed）では閉じない（選択が変わるだけ。離したあとに選択が空なら閉じる）
export const pressCloses = (press: {
  button: number
  inside: boolean
  kept: boolean
  pans: boolean
  followed: boolean
}): boolean => press.button === 0 && !press.inside && !press.kept && !press.pans && !press.followed
