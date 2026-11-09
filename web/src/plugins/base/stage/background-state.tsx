// 背景編集モードで、中身を隠しているか（base が持つステージの画面の状態。ビューが読む）
import { useStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { CONTENT_HIDDEN } from "./background"

export const useContentHidden = (stage: string): boolean => CONTENT_HIDDEN.read(useStageState(stage, kit))
