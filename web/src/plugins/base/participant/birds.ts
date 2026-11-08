// 参加者の記録の鳥（文字）を鳥の id にする。鳥ごとの元の配色の id
import { BIRD_IDS, type Bird } from "../birds"
import { BIRD_PALETTES } from "../birds/colors"

export const asBird = (bird: string | undefined): Bird | null => BIRD_IDS.find(b => b === bird) ?? null

// 鳥 bird の元の配色の id
export const originalPalette = (bird: Bird): string => BIRD_PALETTES.find(p => p.bird === bird)?.id ?? ""
