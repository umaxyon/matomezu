// 紙のプレゼンテーションの印刷区画 1 つのビュー（印刷プレビューと印刷。プレゼンテーションのビューの定義の printSheet）: ページの形とつなぐものを、見るだけで描く。
// 描く形は、受け取った印刷区画に掛かる物だけ（base の sheetShapes。つなぐものは、全部の形の位置で引く）。ページの原点で描く。
// 入力を受けず、形にはアンカーも、e2e や操作が探す印（data-item など）も付けない（同じ形が印刷区画の数だけ描かれるため）
import type { ReactNode } from "react"
import { allowedItems, type CoreCatalog, type ItemPage, type PlacedShape } from "../../../plugin-api"
import {
  type ItemViewProps,
  NO_HOVER,
  NO_POINT,
  type ShapeScene,
  TokenScope,
  useCoreCatalog,
  useTokenScope,
  useUiCatalog,
} from "../../../plugin-api/ui"
import { NO_SHAPE_DEF, NO_SIZE, placedSize, shapeDefOf, sheetShapes, shownRects } from "../../base"
import type { PrintSheetProps } from "../../base/ui"
import styles from "./PaperView.module.css"

const NONE: readonly string[] = []
const NO_IDS: ReadonlySet<string> = new Set()

export function PaperSheet({ zoom, page, column, row, paper }: PrintSheetProps) {
  const catalog = useCoreCatalog()
  const ui = useUiCatalog()
  const itemPage = page as ItemPage
  const { shapes, here } = sheetShapes(catalog, itemPage, paper, column, row)
  const scene: ShapeScene = {
    zoom,
    page: itemPage,
    rects: shownRects(
      catalog,
      shapes.map(item => ({ item, shift: null })),
    ),
    dragged: NONE,
    displaced: NONE,
    reordered: false,
    released: NO_IDS,
    busy: false,
    selectable: false,
    hover: NO_HOVER,
    localOf: () => NO_POINT,
  }
  const connectors = allowedItems(catalog, page).flatMap(c => {
    const view = ui.connectors.get(c)?.view
    return view ? [{ id: c, View: view }] : []
  })
  // この印刷区画に掛かる形だけを描く（またいだ形は、紙の境目で切れる）
  const items = here.map(item => <SheetItem key={item.id} catalog={catalog} zoom={zoom} item={item} />)
  // つなぐもののビューは、紙の大きさに広げて描く（編集の紙と同じ。大きさの無い所に置くと、線の svg が描かれない）。
  // 広げるのは、ページの原点からこの印刷区画の右下まで
  return (
    <div className={styles.sheetArea} style={{ width: (column + 1) * paper.w, height: (row + 1) * paper.h }}>
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
function SheetItem({ catalog, zoom, item }: { catalog: CoreCatalog; zoom: number; item: PlacedShape }) {
  const ui = useUiCatalog().items.get(item.item)
  const tokens = useTokenScope(item.item)
  const size = placedSize(catalog, item)
  const View = ui?.view as ((p: ItemViewProps<PlacedShape["props"]>) => ReactNode) | undefined
  const def = shapeDefOf(catalog, item.item)
  const content = Object.fromEntries(
    Object.keys((def !== NO_SHAPE_DEF && def.content) || {}).map(k => [k, (item as Record<string, unknown>)[k]]),
  )
  return (
    <div
      className={styles.item}
      style={{
        left: item.x,
        top: item.y,
        width: size !== NO_SIZE ? size.w : undefined,
        height: size !== NO_SIZE ? size.h : undefined,
        ...tokens,
      }}
    >
      {View && size !== NO_SIZE ? (
        <View
          props={item.props}
          size={size}
          id={item.id}
          content={content}
          zoom={zoom}
          hasChildren={(item.shapes?.length ?? 0) > 0}
        />
      ) : (
        <div className={styles.unknownItem} />
      )}
      {((item.shapes ?? []) as PlacedShape[]).map(c => (
        <SheetItem key={c.id} catalog={catalog} zoom={zoom} item={c} />
      ))}
    </div>
  )
}
