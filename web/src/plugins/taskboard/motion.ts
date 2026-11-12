// 動きの長さ（ミリ秒）。CSS の transition の終わりを待って状態を切り替えるために、CSS の --motion（0.3s）と同じ値にそろえる
export const MOTION_MS = 300

// 並べ替えで動かした要素の、transition の指定を外すまでの待ち
export const REORDER_CLEAR_MS = MOTION_MS + 20

// 入る側を、畳んだ状態で 1 回描いてから開くための待ち
export const ENTER_FRAME_MS = 50

// 出る側: タスクボードが右へ出る（--motion）→ 枠が閉じる（--motion）の後に取り除く
export const LEAVE_REMOVE_MS = MOTION_MS * 2 + 80

// レーンの最大化・元に戻すで、レーンが広がり（縮み）終わるまでチケットカードを隠しておく長さ
export const LANE_SETTLE_MS = MOTION_MS + 20
