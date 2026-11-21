// 紙のプラグインのプラグイン状態: コピー・切り取りした写し（clip.ts の Clip）。ブック・ページをまたいで貼れるよう、ステージに結ばない値に持つ（読み込み直すと消える）
import { kit } from "../kit"
import type { Clip } from "./clip"

export const CLIP_STATE = kit.definePluginStateOf<Clip>()({ id: "clip", scope: "window" })

export const PAPER_STATES = [CLIP_STATE] as const
