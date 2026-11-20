// スライドの印刷区画 1 つのレイヤー（スロット sheet-layers。印刷プレビューと印刷と、ページ一覧のサムネイル）: ページの slide のアイテムを、見るだけで描く。
// ブックの中身の下に敷く（レイヤーの並び）。背景のタイプで、そのページの背景の印刷が「出さない」なら描かない。
// 入力は受けない。紙の外にはみ出た所は、紙の境目で切れる。アイテムの絵は、アイテムの定義の見た目（ui 台帳）で引く
import {
  type ItemPage,
  type PlacedShape,
  type Point,
  pageType,
  slideIsBackground,
  slideOf,
} from "../../../../plugin-api"
import { useCoreCatalog } from "../../../../plugin-api/ui"
import { BACKGROUND_PRINT, settingValue, slideOffsetOf } from "../../../base"
import type { PrintSheetProps } from "../../../base/ui"
import { rotationOf } from "../rect"
import { useSlideItemView } from "./item-view"
import { SlideItemBox } from "./SlideItemBox"
import styles from "./SlideSheet.module.css"

export function SlideSheet({ zoom, page }: PrintSheetProps) {
  const catalog = useCoreCatalog()
  const type = pageType(catalog, page.type)
  if (!type.slide) return null
  if (slideIsBackground(type) && settingValue(catalog, page, BACKGROUND_PRINT) === "never") return null
  const offset = slideOffsetOf(catalog, page as ItemPage)
  return (
    <>
      {slideOf(page as ItemPage).map(shape => (
        <SheetShape key={shape.id} shape={shape} offset={offset} zoom={zoom} />
      ))}
    </>
  )
}

// アイテム 1 つ（そのアイテムのプラグインのテーマキー --<名前> を、描く要素に置く）
function SheetShape({ shape, offset, zoom }: { shape: PlacedShape; offset: Point; zoom: number }) {
  const { View, tokens } = useSlideItemView(shape.item)
  const size = { w: shape.w ?? 0, h: shape.h ?? 0 }
  return (
    <SlideItemBox
      rect={{ x: shape.x + offset.x, y: shape.y + offset.y, ...size }}
      rotation={rotationOf(shape)}
      tokens={tokens}
      className={styles.item}
    >
      {View && <View props={shape.props} size={size} id={shape.id} content={{}} zoom={zoom} hasChildren={false} />}
    </SlideItemBox>
  )
}
