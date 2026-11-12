// 動きの長さ（ミリ秒）。CSS の transition の終わりを待って状態を切り替えるために、CSS の --motion（0.3s）と同じ値にそろえる
export const MOTION_MS = 300

// 並べ替えで動かした要素の、transition の指定を外すまでの待ち
export const REORDER_CLEAR_MS = MOTION_MS + 20
