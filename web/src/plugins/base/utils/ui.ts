// プラグインに公開する共通の処理のうち見た目の物（フックなど）: ここで書き出した物は、プラグイン API の入口 matomezu/ui からそのまま出る

import { isMac } from "../../../ui/keys"

export { Band } from "./Band"
export { BookIcon, BookOpenIcon } from "./book-icons"
export { belowOf, type Choice, ChoiceBubble } from "./ChoiceBubble"
export { Elapsed } from "./ElapsedText"
export { FolderIcon, FolderOpenIcon } from "./folder-icons"
export { GhostArea } from "./GhostArea"
export { GearIcon } from "./gear-icon"
export { IconButton } from "./IconButton"
export { LineIcon } from "./icon"
export { MaxButton } from "./MaxButton"
export { Panel } from "./Panel"
export { PaperFrame } from "./PaperFrame"
export { type SideTab, SideTabs } from "./SideTabs"
export { SplitHandle } from "./SplitHandle"
export { Tip } from "./Tip"
export { TitledArea } from "./TitledArea"
export { useEditLock, useRecordEditLock } from "./useEditLock"
export { useElapsed } from "./useElapsed"
export { type PaperDrag, type PaperDragWays, usePaperDrag } from "./usePaperDrag"
export { useResize } from "./useResize"
export { useRowSlide } from "./useRowSlide"
export { useZoomMotion } from "./useZoomMotion"

// 選択に足す・外すクリックの修飾キー Mod（Mac は Cmd、ほかは Ctrl。キーの書き方の Mod と同じ）を押しているか
export const modPressed = (e: { ctrlKey: boolean; metaKey: boolean }): boolean => (isMac() ? e.metaKey : e.ctrlKey)
