// マスコットの鳥: 5 羽の鳥の id の並び。マークの鳥の種類（mark/）も、これに合わせる。
// 動き（flight.ts・line.ts）と絵の寸法（sheets.ts）と配色（colors.ts）は見た目でない計算とデータで、絵を描くのは BirdWalk.tsx
export const BIRD_IDS = ["tsunagidori", "inko", "buncho", "suzume", "fukurou"] as const
export type Bird = (typeof BIRD_IDS)[number]

// 鳥の名前の文言の鍵（画面に出すときは t() を通す）
export const BIRD_TITLES = {
  tsunagidori: "Tsunagidori",
  inko: "Parakeet",
  buncho: "Java sparrow",
  suzume: "Sparrow",
  fukurou: "Barn owl",
} as const satisfies Record<Bird, string>
