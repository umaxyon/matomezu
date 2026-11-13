// 鳥のチケットカードへの立ち寄りの、見た目でない決め事: 見に行く手順の入り口の判定・スクロールの量・チケットカードの置き場の変わりの判定。
// 「配置が変わった」は窓の状態を読まず、チケットカードの要素の位置・つながり・inert・手前に別の物があるかだけで決める（測るのは CardVisitView の 1 か所）
export type VisitPhase = "seeking" | "visiting"

// 立ち寄りの状態（窓の中だけ）: seq は続けて同じチケットカードに来るための番号、seeking は見に行く途中、visiting は鳥が来ている間
export interface CardVisit {
  seq: number
  ticket: string
  workroom: string
  phase: VisitPhase
}

// ボードで見る入り口を押せるか: プロジェクトのタスクボードが出ているか、設定を変えて出せるときだけ
export const canVisit = (shown: readonly string[], project: string, canChange: boolean): boolean =>
  shown.includes(project) || canChange

// 出すタスクボードの並び: 出ていればそのまま、出ていなければ後ろに足す
export const withProject = (shown: readonly string[], project: string): string[] =>
  shown.includes(project) ? [...shown] : [...shown, project]

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

// チケットカードの置き場の測り: 位置と、その要素がまだ画面にあって見えているか
export interface Placement {
  rect: Rect
  connected: boolean // 要素が文書につながっているか
  inert: boolean // 要素か祖先が inert か（畳まれたレーン・覆われた画面）
  covered: boolean // 要素の真ん中の手前に、別の物があるか（別の画面・ダイアログが前に来た）
}

const SAME_PX = 1

export const samePlace = (a: Rect, b: Rect): boolean =>
  Math.abs(a.left - b.left) < SAME_PX &&
  Math.abs(a.top - b.top) < SAME_PX &&
  Math.abs(a.width - b.width) < SAME_PX &&
  Math.abs(a.height - b.height) < SAME_PX

// 立ち寄っている間にチケットカードの置き場が変わったか（初めに測った rect からずれた・チケットカードが無くなった・見えなくなった・手前を覆われた）
export const placementBroken = (start: Rect, now: Placement): boolean =>
  !now.connected || now.inert || now.covered || !samePlace(start, now.rect)

// 見える範囲 [viewStart, viewEnd] の中に、物 [start, end] を入れるための最小の動き（範囲より大きい物は始めを合わせる）。
// before は、始めの側に空けておく余白（鳥の場所）。動かさなくてよければ 0
export function nearestShift(start: number, end: number, viewStart: number, viewEnd: number, before = 0): number {
  if (start - before < viewStart) return start - before - viewStart
  if (end > viewEnd) return Math.min(end - viewEnd, start - before - viewStart)
  return 0
}

// 止まるまで見る回数: 同じ置き場が続けて何回（フレーム）続いたら止まったとするか
export const SETTLED_FRAMES = 8
// 待つ上限（ミリ秒）。越えたら立ち寄りをやめる
export const SEEK_LIMIT_MS = 3000
