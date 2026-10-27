// プラグインに公開する共通の処理（計算など見た目でない物）: ここで書き出した物は、プラグイン API の入口 matomezu からそのまま出る。
// ここに置かない base の物は出ない。見た目の物（フックなど）は ui.ts に書き出す（matomezu/ui から出る）
export { type Elapsed, elapsedOf } from "./elapsed"
