// 画面の場所: 見ているもの（workspace）のうち、読み直しても戻したいもの。ステージごとに開いているブックとページ・倍率・ずらす量（印刷プレビューの間は、
// 閉じたときに戻す編集の倍率とずらす量。印刷プレビューの間かは入れず、読み直すと編集に戻る）、
// カレントのステージ、分けている境目の割合。選択・置こうとしているアイテム・道具は入れない（その場の操作の途中の状態のため）。
// ホストがこれを外（ブラウザの URL など）に写し、外から戻すときに当てはめる。操作はデータを書き換えず、新しい値を返す

import { hasPages } from "./book"
import type { CoreCatalog } from "./core-catalog"
import type { Point } from "./geom"
import type { Book } from "./schema/book"
import { newStage, openBook, openPage, panBy, type Stage, stopStart } from "./stage"
import { MAX_STAGES, MIN_SHARE, type Workspace } from "./workspace"

export interface StagePlace {
  book: string | null // 開いているブックの id（何も開いていなければ null）
  page: string | null // 開いているページの id
  zoom: number
  pan: Point
}

export interface Address {
  stages: readonly StagePlace[] // 左から順
  current: number // カレントのステージの、左からの番号
  share: number // 分けている境目の割合（左のステージの幅）
}

// 見ているものの場所
export function addressOf(ws: Workspace): Address {
  return {
    stages: ws.stages.map(s => {
      const view = s.mode.kind === "print-preview" ? s.mode.back : s
      return { book: s.opened?.book ?? null, page: s.opened?.page ?? null, zoom: view.zoom, pan: view.pan }
    }),
    current: Math.max(
      0,
      ws.stages.findIndex(s => s.id === ws.current),
    ),
    share: ws.arrangement.share,
  }
}

// 移動したか: ステージの数か、どれかのステージのブック・ページが違う（倍率・ずらす量・カレント・境目だけの違いは移動ではない）
export function moved(a: Address, b: Address): boolean {
  return (
    a.stages.length !== b.stages.length ||
    a.stages.some((s, i) => s.book !== b.stages[i]?.book || s.page !== b.stages[i]?.page)
  )
}

// ステージ stage に、場所 place を当てはめる（無いブック・ページは開かず、開けたものに倍率とずらす量を戻す）
function placed(catalog: CoreCatalog, books: Readonly<Record<string, Book>>, stage: Stage, place: StagePlace): Stage {
  const book = place.book === null ? undefined : books[place.book]
  // 表示領域の大きさ（URL には書かない）はステージのまま
  const fresh = { ...newStage(stage.id), view: stage.view }
  if (!book) return fresh
  let next = openBook(catalog, fresh, book)
  if (place.page !== null && hasPages(book)) next = openPage(catalog, next, book, place.page)
  // ずらす量は、ほかの操作と同じく範囲に収める（表示領域を測るまでは収めない）。初めの位置には合わせない（場所のずらす量が 0 のときも）
  const zoomed = { ...stopStart(next), zoom: place.zoom }
  return panBy(zoomed, place.pan.x - zoomed.pan.x, place.pan.y - zoomed.pan.y)
}

// 見ているもの ws に場所 address を当てはめる。ステージは左から同じ番号のものを使い回し、足りなければ番号を振って足す
// （MAX_STAGES まで）。開けないブック・ページのステージは何も開かない。場所にステージが無ければ ws のまま
export function placeAt(
  catalog: CoreCatalog,
  books: Readonly<Record<string, Book>>,
  ws: Workspace,
  address: Address,
): Workspace {
  const places = address.stages.slice(0, MAX_STAGES)
  if (places.length === 0) return ws
  let issued = ws.issued
  const stages = places.map((place, i) => {
    const stage = ws.stages[i] ?? newStage(`s${++issued}`)
    return placed(catalog, books, stage, place)
  })
  const current = stages[Math.min(Math.max(0, address.current), stages.length - 1)] as Stage
  const share = Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, address.share))
  return { ...ws, stages, current: current.id, issued, arrangement: { ...ws.arrangement, share } }
}

// 場所が今のままで当てはめを省くときの見ているもの ws: 当てはめたときと同じく、どのステージも初めの位置に合わせない（変わらなければ ws のまま）
export function keepPlace(ws: Workspace): Workspace {
  const stages = ws.stages.map(stopStart)
  return stages.every((s, i) => s === ws.stages[i]) ? ws : { ...ws, stages }
}
