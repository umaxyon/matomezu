// プラグイン API の入口 matomezu（React なし）: プラグイン API（plugin-api）の名前を外に出す。型の書き足しは matomezu/catalog（core/catalog.ts）に向ける

// zod は matomezu の実物を使う（追加プラグインが自分で入れた zod は使わない）
export { z } from "zod"
export * from "../plugin-api"

// ビルトインプラグインが core/catalog.ts に書き足した物（ItemTable など）を、いつも型に含める（ビルトインは必ずいるので、
// 追加プラグインのプロジェクトがビルトインのファイルを読まなくても、ビルトインの id と型が引ける）
import type {} from "../plugins"

// base の置く計算・文字と、base が拡張ポイントに書き足した物の型（ビルトインプラグインは plugins/base から読む）
export type {
  Axis,
  Edges,
  Frame,
  Gap,
  GrowFrom,
  MinimapMark,
  PageContext,
  PageFieldsWay,
  PageProblem,
  PortArea,
  Ports,
} from "../plugins/base"
export {
  AlignSchema,
  adaptPage,
  addPageIn,
  apart,
  BODY_MAX,
  CHILD_AREA,
  captionTextWidth,
  childOrigin,
  clampLines,
  commitChildren,
  createBookIn,
  evenGap,
  extentOf,
  fitsPaper,
  frameAround,
  frameOf,
  gapOf,
  inPaper,
  itemSize,
  keepApart,
  knownTheme,
  LEN,
  minSize,
  NEST_PADDING,
  newClash,
  nextItemId,
  PLACE_LINES,
  pageContext,
  pageFieldsWay,
  paperSize,
  placeChild,
  placedAt,
  placedSize,
  placeItem,
  portAreasOf,
  rectsOf,
  removeItems,
  replaceChild,
  replacePushing,
  replaceShape,
  replaceShapePushing,
  resizedBy,
  settingValue,
  settleChildren,
  shapeDefOf,
  shownRects,
  TEXT_LOOK,
  textNew,
  textPatch,
  textProps,
  toData,
  tooClose,
  unpinPage,
  widenForCaption,
  withPage,
  wrap,
} from "../plugins/base"

// プラグインに公開する共通の処理（base の utils に書き出した物は、そのまま出る）
export * from "../plugins/base/utils"
