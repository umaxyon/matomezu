// 背景編集モードで、中身を隠しているか（base が持つステージのプラグイン状態。ビューが読む）
import { usePluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { CONTENT_HIDDEN } from "./states"

export const useContentHidden = (stage: string): boolean => usePluginState(kit, CONTENT_HIDDEN, stage) ?? false
