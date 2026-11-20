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
export {
  alignPadding,
  extentOf,
  type GrowRule,
  type GrowSides,
  growKindOf,
  grownArea,
  growOf,
  paperSize,
  roomOf,
  slideOffsetOf,
} from "./grow"
export type { GrowFrom } from "./items"
export {
  adaptPage,
  FAMILY_TITLE_CHECK,
  followConnectors,
  gapOf,
  keepApart,
  nextItemId,
  PROP_NAMES_CHECK,
  placedAt,
  placeItem,
  removeItems,
  replacePushing,
  replaceShapePushing,
  shapeThemeFits,
  shownRects,
  tidyPage,
  unpinPage,
} from "./items"
export type { PortArea, Ports } from "./placed"
export { allRectsOf, NEST_PADDING, placedSize, portAreasOf, rectsOf, shapeDefOf } from "./placed"
export type { Axis, Gap } from "./push"
export { apart, evenGap, inPaper, LEN, newClash, tooClose } from "./push"
export { type Edges, itemSize, minSize, resizedBy, widenForCaption } from "./size"
