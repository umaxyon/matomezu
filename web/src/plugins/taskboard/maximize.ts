// タスクボードとレーンの最大化の遷移: タスクボードは 1 つだけ最大化でき、レーンを最大化するとそのタスクボードも最大化する（レーンの前からタスクボードを最大化していたかを持ち、
// レーンを元に戻すと、その最大化に戻す）。どれも純粋な関数で、状態は窓のプラグイン状態（states.ts の MAXIMIZED）
export interface Maximized {
  board: string
  lane?: string // 最大化しているレーン（無ければタスクボードだけ）
  boardWasMax?: boolean // レーンを最大化する前から、そのタスクボードを最大化していたか
}

// タスクボード board を最大化する・元に戻す（レーンの最大化は解く）
export const toggleBoard = (now: Maximized | undefined, board: string): Maximized | undefined =>
  now?.board === board ? undefined : { board }

// タスクボード board のレーン lane を最大化する・元に戻す（元に戻すと、レーンの前の最大化に戻す）
export function toggleLane(now: Maximized | undefined, board: string, lane: string): Maximized | undefined {
  if (now?.board === board && now.lane === lane) return now.boardWasMax ? { board } : undefined
  return { board, lane, boardWasMax: now?.board === board && now.lane === undefined }
}

// 出ていくタスクボード board の最大化を解く
export const released = (now: Maximized | undefined, board: string): Maximized | undefined =>
  now?.board === board ? undefined : now

// 最大化の状態 now が、出しているタスクボードの並び shown に残っているか（出ていないタスクボードの最大化は無いものとする）
export const maximizedAmong = (now: Maximized | undefined, shown: readonly string[]): Maximized | undefined =>
  now && shown.includes(now.board) ? now : undefined
