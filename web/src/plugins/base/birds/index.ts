// マスコットの鳥: 5 羽の鳥の id の並び。マークの鳥の種類（mark/）も、これに合わせる。
// 動き（flight.ts）とコマの切り出し（frames.ts）は見た目でない計算とデータで、絵を描くのは BirdWalk.tsx
export const BIRD_IDS = ["tsunagidori", "inko", "buncho", "suzume", "fukurou"] as const
export type Bird = (typeof BIRD_IDS)[number]
