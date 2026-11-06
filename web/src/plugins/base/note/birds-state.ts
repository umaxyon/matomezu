// 伝言の付ける先の鳥の割り当て（付ける先 → 鳥）の、base のステージの画面の状態での持ち方: noteBirds に持つ。
// 右サイドパネルが伝言を出している間だけ持ち、付ける先が無くなれば消す。ブックのデータにも URL にも入れない
import type { Bird } from "../birds"
import { stageItem } from "../utils/stage-item"

const NOTE_BIRDS = stageItem<Readonly<Record<string, Bird>>>("noteBirds", {}, birds => Object.keys(birds).length === 0)

// base のステージの画面の状態 state の、鳥の割り当て（無ければ空）
export const birdsIn = NOTE_BIRDS.read

// base のステージの画面の状態 state の、鳥の割り当てを birds にしたもの（空なら消す）
export const withBirds = NOTE_BIRDS.write
