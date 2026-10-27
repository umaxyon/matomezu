// プラグイン API の入口 matomezu（React なし）: プラグイン API（plugin-api）の名前を外に出す。機能台帳の型の側への書き足しは matomezu/catalog（core/catalog.ts）に向ける

// zod は matomezu の実物を使う（追加プラグインが自分で入れた zod は使わない）
export { z } from "zod"
export * from "../plugin-api"

// ビルトインプラグインが機能台帳の型の側に書き足した物（ItemTable など）を、いつも型に含める（ビルトインは必ずいるので、
// 追加プラグインのプロジェクトがビルトインのファイルを読まなくても、ビルトインの id と型が引ける）
import type {} from "../plugins"

// base の置く計算と文字（ビルトインプラグインは plugins/base から読む）
export type { Axis, Edges, Gap } from "../plugins/base"
export {
  AlignSchema,
  addPageIn,
  apart,
  BODY_MAX,
  captionTextWidth,
  clampLines,
  createBookIn,
  evenGap,
  fitsPaper,
  gapOf,
  inPaper,
  itemSize,
  keepApart,
  knownTheme,
  LEN,
  minSize,
  newClash,
  nextItemId,
  PLACE_LINES,
  paperSize,
  placedAt,
  placeItem,
  removeItems,
  replacePushing,
  resizedBy,
  settingValue,
  shapeDefOf,
  shownRects,
  TEXT_LOOK,
  textNew,
  textPatch,
  textProps,
  tooClose,
  unpinPage,
  widenForCaption,
  withPage,
  wrap,
} from "../plugins/base"
