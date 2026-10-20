// 見ているもの。画面の見える領域をステージ（stage.ts）に分け、ステージごとにブックを開く（何も開かないステージもある）。
// 道具箱・キー・タブなどの操作の宛先は、カレントのステージ。
// ステージの並べ方は arrangement が持ち、ステージは自分の置き場所を知らない。
// ステージの id は、作るたびに番号を 1 つ進めて振り、閉じたステージの id も使い回さない（後から届く操作や履歴が、別のステージを指さないように）。
// 操作はデータを書き換えず、新しい値を返す（変わらないステージは同じものを使い回す）

import type { PagedBook } from "./book"
import { fail } from "./errors"
import type { Registry } from "./registry"
import type { Book } from "./schema/book"
import { newStage, openBook, openPage, type Stage } from "./stage"

// 横に並べる
export interface Arrangement {
  direction: "row"
}

export interface Workspace {
  stages: Stage[]
  current: string // カレントのステージの id
  arrangement: Arrangement
  issued: number // 最後に振ったステージの番号
}

export const MAX_STAGES = 2

// ステージ 1 つ。ブックを渡せばそれを開き、無ければ何も開かない
export function newWorkspace(reg: Registry, book: Book | null): Workspace {
  return {
    stages: [book ? openBook(reg, newStage("s1"), book) : newStage("s1")],
    current: "s1",
    arrangement: { direction: "row" },
    issued: 1,
  }
}

export function currentStage(ws: Workspace): Stage {
  const stage = ws.stages.find(s => s.id === ws.current)
  if (!stage) return fail("E105", { id: ws.current })
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

// カレントのステージの右に、何も開いていないステージを足す
export function split(ws: Workspace): Workspace {
  if (ws.stages.length >= MAX_STAGES) return ws
  const cur = currentStage(ws)
  const issued = ws.issued + 1
  const added = newStage(`s${issued}`)
  const at = ws.stages.indexOf(cur) + 1
  return { ...ws, stages: [...ws.stages.slice(0, at), added, ...ws.stages.slice(at)], issued }
}

// カレントのステージだけを残す
export function unsplit(ws: Workspace): Workspace {
  if (ws.stages.length === 1) return ws
  return { ...ws, stages: [currentStage(ws)] }
}

// ステージを閉じる。最後の 1 つは閉じない。カレントを閉じたら、隣（無ければ左）がカレントになる
export function close(ws: Workspace, id: string): Workspace {
  const at = ws.stages.findIndex(s => s.id === id)
  if (ws.stages.length === 1 || at < 0) return ws
  const stages = ws.stages.filter(s => s.id !== id)
  const next = stages[at] ?? stages[at - 1]
  if (!next) return ws
  return { ...ws, stages, current: ws.current === id ? next.id : ws.current }
}

export function focus(ws: Workspace, id: string): Workspace {
  if (ws.current === id || !ws.stages.some(s => s.id === id)) return ws
  return { ...ws, current: id }
}

// ステージに、開いているブックのページを開く
export function showPage(reg: Registry, ws: Workspace, stage: string, book: PagedBook, page: string): Workspace {
  return mapStage(ws, stage, s => openPage(reg, s, book, page))
}
