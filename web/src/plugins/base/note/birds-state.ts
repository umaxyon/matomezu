// 伝言の付ける先の鳥の割り当て（付ける先 → 鳥）の、base のステージのプラグイン状態 note-birds での持ち方:
// 右サイドパネルが伝言を出している間だけ持ち、付ける先が無くなれば消す。ブックのデータにも URL にも入れない
import type { Bird } from "../birds"
import { kit } from "../kit"

// 鳥を割り当てた付ける先が無いときの値
const NO_BIRDS: Readonly<Record<string, Bird>> = {}

export const NOTE_BIRDS = kit.definePluginStateOf<Readonly<Record<string, Bird>>>()({
  id: "note-birds",
  scope: "stage",
  default: NO_BIRDS,
})

export const NOTE_STATES = [NOTE_BIRDS] as const
