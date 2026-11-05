// 紙の見せ方の印刷区画 1 つのビュー（印刷プレビューと印刷。ブックのビューの定義の printSheet）: ページの形とつなぐものを、見るだけで描く。
// 描く形は、受け取った印刷区画に掛かる物だけ（base の sheetShapes。つなぐものは、全部の形の位置で引く）。ページの原点で描く。
// 入力を受けず、形にはアンカーも、e2e や操作が探す印（data-item など）も付けない（同じ形が印刷区画の数だけ描かれるため）
import type { ReactNode } from "react"
import { bookItems, type CoreCatalog, type ItemPage, type PlacedShape } from "../../../plugin-api"
import {
  type ItemViewProps,
  type ShapeScene,
  TokenScope,
  useCoreCatalog,
  useStage,
  useTokenScope,
  useUiCatalog,
} from "../../../plugin-api/ui"
import { placedSize, shapeDefOf, sheetShapes, shownRects } from "../../base"
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
  const { shapes, here } = sheetShapes(catalog, itemPage, paper, column, row)
  const scene: ShapeScene = {
    stage,
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
    hover: null,
    localOf: () => null,
  }
  const connectors = bookItems(catalog, book).flatMap(c => {
    const view = ui.connectors.get(c)?.view
    return view ? [{ id: c, View: view }] : []
  })
  // この印刷区画に掛かる形だけを描く（またいだ形は、紙の境目で切れる）
  const items = here.map(item => <SheetItem key={item.id} catalog={catalog} stage={id} zoom={stage.zoom} item={item} />)
  return connectors.reduceRight<ReactNode>(
    (inner, { id: c, View }) => (
      <TokenScope key={c} def={c}>
        <View scene={scene}>{inner}</View>
      </TokenScope>
    ),
    items,
  )
}

// 置いた形 1 つと、その中の子の形（子は親の左上からの位置で、親の中に描く）。結んだビューで描き、ビューの無い形は枠だけを描く
function SheetItem({
  catalog,
  stage,
  zoom,
  item,
}: {
  catalog: CoreCatalog
  stage: string
  zoom: number
  item: PlacedShape
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
        <SheetItem key={c.id} catalog={catalog} stage={stage} zoom={zoom} item={c} />
      ))}
    </div>
  )
}
