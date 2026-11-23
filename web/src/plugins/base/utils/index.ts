// プラグインに公開する共通の処理（計算など見た目でない物）: ここで書き出した物は、プラグイン API の入口 matomezu からそのまま出る。
// ここに置かない base の物は出ない。見た目の物（フックなど）は ui.ts に書き出す（matomezu/ui から出る）

export { AnchorsArg, anchorsOf, lastAnchor, NO_ANCHORS } from "./anchors"
export { ColorSchema, colorPaint } from "./color"
export { DRAG_START } from "./drag"
export { edgePanner, edgeScroll, NO_VIEW_AREA } from "./edge-pan"
export { EDGE_MAX, EDGE_ZONE, edgeSpeed } from "./edge-speed"
export { type Elapsed, elapsedOf } from "./elapsed"
export { contentIdMaker, renewedIds, survivesRenewedIds } from "./ids"
export { endInPlace, type InPlaceDraft, type InPlaceDraftState, inPlaceText, NO_DRAFT } from "./in-place"
export { joinMessages } from "./join-messages"
export { changeWithLock } from "./lock"
export { hasOpenedPage, stagePageId } from "./opened-page"
export { actionsOfPage } from "./page-actions"
export { refusalMessage } from "./refusal"
export { amongSelected, onlySelected, toggledSelection } from "./selection"
