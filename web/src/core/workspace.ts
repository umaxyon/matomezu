// 見ているもの。画面の見える領域をステージ（stage.ts）に分け、ステージごとにブックのページを開く。
// 道具箱・キー・タブなどの操作の宛先は、カレントのステージ。
// ステージの並べ方は arrangement が持ち、ステージは自分の置き場所を知らない。
// 操作はデータを書き換えず、新しい値を返す（変わらないステージは同じものを使い回す）
import { nextNumber } from "./ids"
import { newStage, openPage, type Stage } from "./stage"

// 横に並べる
export interface Arrangement {
  direction: "row"
}

export interface Workspace {
  stages: Stage[]
  current: string // カレントのステージの id
  arrangement: Arrangement
}

export const MAX_STAGES = 2

export function newWorkspace(book: string, page: string): Workspace {
  return { stages: [newStage("s1", book, page)], current: "s1", arrangement: { direction: "row" } }
}

export function currentStage(ws: Workspace): Stage {
  const stage = ws.stages.find(s => s.id === ws.current)
  if (!stage) throw new Error(`no current stage: ${ws.current}`)
  return stage
}

// ステージ 1 つに操作をかける。変わらなければ同じ workspace を返す
export function mapStage(ws: Workspace, id: string, change: (s: Stage) => Stage): Workspace {
  let changed = false
  const stages = ws.stages.map(s => {
    if (s.id !== id) return s
    const next = change(s)
    if (next !== s) changed = true
    return next
  })
  return changed ? { ...ws, stages } : ws
}

// カレントのステージの右に、同じページを開いたステージを足す
export function split(ws: Workspace): Workspace {
  if (ws.stages.length >= MAX_STAGES) return ws
  const cur = currentStage(ws)
  const ids = ws.stages.map(s => s.id)
  const added = newStage(`s${nextNumber("s", ids)}`, cur.book, cur.page)
  const at = ws.stages.indexOf(cur) + 1
  return { ...ws, stages: [...ws.stages.slice(0, at), added, ...ws.stages.slice(at)] }
}

// カレントのステージだけを残す
export function unsplit(ws: Workspace): Workspace {
  if (ws.stages.length === 1) return ws
  return { ...ws, stages: [currentStage(ws)] }
}

export function focus(ws: Workspace, id: string): Workspace {
  if (ws.current === id || !ws.stages.some(s => s.id === id)) return ws
  return { ...ws, current: id }
}

// カレントのステージに、同じブックのページを開く
export function showPage(ws: Workspace, page: string): Workspace {
  return mapStage(ws, ws.current, s => openPage(s, page))
}
