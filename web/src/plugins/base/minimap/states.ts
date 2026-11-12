// ミニマップのプラグイン状態の宣言: 紙に描いたつなぐもののミニマップの絵（つなぐものの種類の id ごと。無ければ持たない）
import { kit } from "../kit"
import type { MinimapMark } from "./marks"

// 種類の id → 描いたページの id と絵
export type DrawnTable = Readonly<Record<string, { page: string; marks: readonly MinimapMark[] }>>

export const MINIMAP_DRAWN = kit.definePluginStateOf<DrawnTable>()({ id: "minimap-drawn", scope: "stage" })

export const MINIMAP_STATES = [MINIMAP_DRAWN] as const
