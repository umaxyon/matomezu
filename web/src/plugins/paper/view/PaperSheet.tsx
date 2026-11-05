// 紙の見せ方の紙 1 枚のビュー（印刷プレビューと印刷。ブックのビューの定義の printSheet）: ページの形とつなぐものを、見るだけで描く。
// ページの直下の形は、載る印刷区画の中へ寄せて描き（base の snapShift。子は親について行く）、つなぐものは寄せた形の位置で引き直す。
// ページを丸ごと描いて、受け取った印刷区画の左上が原点になるようにずらす（はみ出した所は外の印刷区画の枠が切る）。
// 入力を受けず、形にはアンカーも、e2e や操作が探す印（data-item など）も付けない（同じ形が印刷区画の数だけ描かれるため）
import type { ReactNode } from "react"
import { bookItems, type CoreCatalog, type ItemPage, type PlacedShape, type Point, shapesOf } from "../../../plugin-api"
import {
  type ItemViewProps,
  type ShapeScene,
  TokenScope,
  useCoreCatalog,
  useStage,
  useTokenScope,
  useUiCatalog,
} from "../../../plugin-api/ui"
import { placedSize, shapeDefOf, shownRects, snapShift } from "../../base"
import type { PrintSheetProps } from "../../base/ui"
import styles from "./PaperView.module.css"

const NONE: readonly string[] = []
const NO_IDS: ReadonlySet<string> = new Set()

export function PaperSheet({ stage: id, book, page, column, row, paper }: PrintSheetProps) {
  const catalog = useCoreCatalog()
  const ui = useUiCatalog()
  const stage = useStage(id)
  if (!stage) return null
  const itemPage = page as ItemPage
  const shapes = shapesOf(itemPage).map(item => {
    const size = placedSize(catalog, item)
    return { item, shift: size ? snapShift({ x: item.x, y: item.y, ...size }, paper) : null }
  })
  const scene: ShapeScene = {
    stage,
    page: itemPage,
    rects: shownRects(catalog, shapes),
    dragged: NONE,
    displaced: NONE,
    reordered: false,
    released: NO_IDS,
    busy: false,
    selectable: false,
    hover: null,
    localOf: () => null,
  }
  const connectors = bookItems(catalog, book).flatMap(c => {
    const view = ui.connectors.get(c)?.view
    return view ? [{ id: c, View: view }] : []
  })
  const items = shapes.map(({ item, shift }) => (
    <SheetItem key={item.id} catalog={catalog} stage={id} zoom={stage.zoom} item={item} shift={shift} />
  ))
  return (
    <div className={styles.sheet} style={{ left: -column * paper.w, top: -row * paper.h }}>
      {connectors.reduceRight<ReactNode>(
        (inner, { id: c, View }) => (
          <TokenScope key={c} def={c}>
            <View scene={scene}>{inner}</View>
          </TokenScope>
        ),
        items,
      )}
    </div>
  )
}

// 置いた形 1 つと、その中の子の形（子は親の左上からの位置で、親の中に描く）。結んだビューで描き、ビューの無い形は枠だけを描く
function SheetItem({
  catalog,
  stage,
  zoom,
  item,
  shift,
}: {
  catalog: CoreCatalog
  stage: string
  zoom: number
  item: PlacedShape
  shift: Point | null
}) {
  const ui = useUiCatalog().items.get(item.item)
  const tokens = useTokenScope(item.item)
  const size = placedSize(catalog, item)
  const View = ui?.view as ((p: ItemViewProps<PlacedShape["props"]>) => ReactNode) | undefined
  const content = Object.fromEntries(
    Object.keys(shapeDefOf(catalog, item.item)?.content ?? {}).map(k => [k, (item as Record<string, unknown>)[k]]),
  )
  return (
    <div
      className={styles.item}
      style={{
        left: item.x,
        top: item.y,
        width: size?.w,
        height: size?.h,
        transform: shift ? `translate(${shift.x}px, ${shift.y}px)` : undefined,
        ...tokens,
      }}
    >
      {View && size ? (
        <View
          props={item.props}
          size={size}
          id={item.id}
          stage={stage}
          content={content}
          zoom={zoom}
          hasChildren={(item.shapes?.length ?? 0) > 0}
        />
      ) : (
        <div className={styles.unknownItem} />
      )}
      {((item.shapes ?? []) as PlacedShape[]).map(c => (
        <SheetItem key={c.id} catalog={catalog} stage={stage} zoom={zoom} item={c} shift={null} />
      ))}
    </div>
  )
}
