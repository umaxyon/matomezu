// プラグインに公開する共通の処理のうち見た目の物（フックなど）: ここで書き出した物は、プラグイン API の入口 matomezu/ui からそのまま出る

import { isMac } from "../../../ui/keys"

export { Stand, type StandAway, useAnchorRef, useStandAway } from "./anchors"
export { ChoiceSetting } from "./ChoiceSetting"
export { CornerItem } from "./corner"
export { LockToggle } from "./LockToggle"
export { PageProblemsView, usePageProblems } from "./PageProblems"
export { PaperFrame } from "./PaperFrame"
export { type Revealable, useRevealable } from "./revealable"
export { type SettingsPatch, useSettingControls } from "./SettingControls"
export type { StandSide } from "./stand-place"
export { useEditLock } from "./useEditLock"
export { useElapsed } from "./useElapsed"
export { type PaperDrag, type PaperDragWays, usePaperDrag } from "./usePaperDrag"
export { useResize } from "./useResize"
export { useZoomMotion } from "./useZoomMotion"

// 選択に足す・外すクリックの修飾キー Mod（Mac は Cmd、ほかは Ctrl。キーの書き方の Mod と同じ）を押しているか
export const modPressed = (e: { ctrlKey: boolean; metaKey: boolean }): boolean => (isMac() ? e.metaKey : e.ctrlKey)
