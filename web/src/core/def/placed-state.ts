// 場所に入れる画面の状態の定義: プラグインのステージごとの画面の状態のうち、画面の場所（core/address.ts。ホストがブラウザの URL に写す）に入れて、読み直しても戻す物。
// プラグインのフィールド placedState に書く（置き場はプラグインごとに 1 つなので、定義の種類にはしない）。入れる・戻すのは store（store/placed-state.ts）
import type { z } from "zod"

export interface PlacedStateDef<S = unknown> {
  schema: z.ZodType<S> // 場所に入れる値の形
  take?(state: unknown): S | undefined // 置き場の state のうち、場所に入れる部分（無ければ undefined）。書かなければ置き場をそのまま入れる
  put?(placed: S | undefined, state: unknown): unknown // 場所の値 placed（無いか形に合わなければ undefined）を、置き場の今の state に戻した新しい置き場。書かなければ placed をそのまま置く
}
