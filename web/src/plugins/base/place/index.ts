// アイテムを置く処理: 置く・押しのける・枠・伸びの処理を集める

export { type AiPlaced, aiPlacedOf, itemAiPlaced } from "./ai-placed"
export type { Frame } from "./frame"
export {
  CHILD_AREA,
  childOrigin,
  commitChildren,
  frameAround,
  frameOf,
  freeSpotIn,
  placeChild,
  replaceChild,
  settleChildren,
  toData,
} from "./frame"
export { type GrowRule, type GrowSides, grownArea } from "./grow"
export type { Edges, GrowFrom } from "./items"
export {
  adaptPage,
  alignPadding,
  extentOf,
  FAMILY_TITLE_CHECK,
  followConnectors,
  gapOf,
  growOf,
  itemSize,
  keepApart,
  minSize,
  nextItemId,
  PROP_NAMES_CHECK,
  paperSize,
  placedAt,
  placeItem,
  removeItems,
  replacePushing,
  replaceShapePushing,
  resizedBy,
  roomOf,
  shapeThemeFits,
  shownRects,
  slideOffsetOf,
  tidyPage,
  unpinPage,
  widenForCaption,
} from "./items"
export type { PortArea, Ports } from "./placed"
export { allRectsOf, NEST_PADDING, placedSize, portAreasOf, rectsOf, shapeDefOf } from "./placed"
export type { Axis, Gap } from "./push"
export { apart, evenGap, inPaper, LEN, newClash, tooClose } from "./push"
