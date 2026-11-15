// 橋渡しの間だけ（M-0066。最後にこのファイルごと消す）: 古い形（フックの第 1 引数や、ビューの props に渡すステージの id）を受けるかどうかの切り替え。
// LegacyOn を false にすると、古い形の呼び出しと props の stage が全部、型の誤りになる（残りを数えるのに使う。scripts/m0066-left.sh）
export type LegacyOn = true

// 古い形の第 1 引数（ステージの id など。切ると渡せない）
export type LegacyId = LegacyOn extends true ? string : never

// 古い形の props（ビューに渡していたステージの id。切ると props に無い）
export type LegacyStageProps = LegacyOn extends true ? { stage: string } : unknown

// 橋渡しの間だけの物の型（切ると使えない）
export type LegacyOnly<T> = LegacyOn extends true ? T : never
