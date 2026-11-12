// プラグインに公開する共通の処理のうち見た目の物（フックなど）: ここで書き出した物は、プラグイン API の入口 matomezu/ui からそのまま出る

import { isMac } from "../../../ui/keys"

export { Stand, type StandAway, useAnchorRef, useAnchorShapeRef, useStandAway } from "./anchors"
export { Band } from "./Band"
export { AtCorner, CORNER_STATUSES, type CornerStatusProps, defineCornerStatus, useAtCornerBubble } from "./corner"
export { Elapsed } from "./ElapsedText"
export { IconButton } from "./IconButton"
export { MaxButton } from "./MaxButton"
export { Panel } from "./Panel"
export { PaperFrame } from "./PaperFrame"
export { type Revealable, useRevealable } from "./revealable"
export { type SettingsPatch, useSettingControls } from "./SettingControls"
export { SplitHandle } from "./SplitHandle"
export type { StandSide } from "./stand-place"
export { Tip } from "./Tip"
export { TitledArea } from "./TitledArea"
export { useEditLock, useRecordEditLock } from "./useEditLock"
export { useElapsed } from "./useElapsed"
export { type PaperDrag, type PaperDragWays, usePaperDrag } from "./usePaperDrag"
export { useResize } from "./useResize"
export { useZoomMotion } from "./useZoomMotion"

// 選択に足す・外すクリックの修飾キー Mod（Mac は Cmd、ほかは Ctrl。キーの書き方の Mod と同じ）を押しているか
export const modPressed = (e: { ctrlKey: boolean; metaKey: boolean }): boolean => (isMac() ? e.metaKey : e.ctrlKey)
