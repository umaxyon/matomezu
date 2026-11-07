// 鳥の絵のシート（images/sheets/ の鳥ごとの 2 枚。scripts/birds.ts が作る）の寸法。
// どの鳥もコマは同じ大きさで、足元の位置も同じ（anchorX、groundY は切り出した四角の左上から。絵の px）。
// コマの並び: 0〜3 羽上げ・羽下げ・着地の準備・着地、4〜6 正面・左を見る・右を見る、7 跳び上がり、8〜11 歩く、12〜15 その鳥の仕草
import type { Bird } from "."

export const FRAME = 150 // 1 コマの幅（高さも同じ）
export const COLUMNS = 4
export const SHEET_SIZE = FRAME * COLUMNS
export const ANCHOR_X = 75
export const GROUND_Y = 127
export const FACE_SIZE = 48 // 顔の丸い絵の一辺（px）
export const CELL = 104.5 // 鳥の大きさの基準になる幅（表示の倍率は、これを鳥の大きさに合わせる）

// 鳥ごとの、歩くコマの鳥の旗まで入れた幅（歩く距離を決める）
export const BODY_WIDTH: Readonly<Record<Bird, number>> = {
  tsunagidori: 99.33,
  inko: 92,
  buncho: 93.33,
  suzume: 98.33,
  fukurou: 94,
}
