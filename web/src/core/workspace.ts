// 見ているもの。画面の見える領域をステージ（stage.ts）に分け、ステージごとにブックを開く（何も開かないステージもある）。
// 道具箱・キー・タブなどの操作の宛先は、カレントのステージ。
// ステージの並べ方は arrangement が持ち、ステージは自分の置き場所を知らない。
// ステージの id は、作るたびに番号を 1 つ進めて振り、閉じたステージの id も使い回さない（後から届く操作や履歴が、別のステージを指さないように）。
// 操作はデータを書き換えず、新しい値を返す（変わらないステージは同じものを使い回す）

import type { PagedBook } from "./book"
import { fail } from "./errors"
import type { Registry } from "./registry"
import type { Book } from "./schema/book"
import {
  closeBook,
  followBook as followStage,
  newStage,
  openBook,
  openPage,
  type Stage,
  stopPlacing,
  togglePlacing as togglePlacingOn,
} from "./stage"
import type { ItemId } from "./tables"
import { hasTool, type Tool, type Tools, toolIn, toolSetOf } from "./tools"

// 横に並べる
export interface Arrangement {
  direction: "row"
}

export interface Workspace {
  stages: Stage[]
  current: string // カレントのステージの id
  arrangement: Arrangement
  issued: number // 最後に振ったステージの番号
  tools: Tools // 道具の組ごとの今の道具（core/tools.ts）
}

export const MAX_STAGES = 2

// ステージ 1 つ。ブックを渡せばそれを開き、無ければ何も開かない
export function newWorkspace(reg: Registry, book: Book | null): Workspace {
  return {
    stages: [book ? openBook(reg, newStage("s1"), book) : newStage("s1")],
    current: "s1",
    arrangement: { direction: "row" },
    issued: 1,
    tools: {},
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

export const hasStage = (ws: Workspace, id: string): boolean => ws.stages.some(s => s.id === id)

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

// ステージの今の道具（無いステージや、道具を使わないステージは null）
export function toolOf(reg: Registry, ws: Workspace, id: string): Tool | null {
  const stage = ws.stages.find(s => s.id === id)
  const set = stage ? toolSetOf(reg, stage) : null
  return set ? toolIn(ws.tools, set) : null
}

// ステージが使う道具の組の道具を替える。同じ組を使うステージは、全部その道具になる。組に無い道具には替えない。
// 置くのは選択の道具の仕事なので、その組を使うステージの置こうとしていたアイテムは、全部取り消す
export function setTool(reg: Registry, ws: Workspace, id: string, tool: Tool): Workspace {
  const stage = ws.stages.find(s => s.id === id)
  const set = stage ? toolSetOf(reg, stage) : null
  if (!set || !hasTool(set, tool)) return ws
  const stages = ws.stages.map(s => (toolSetOf(reg, s) === set ? stopPlacing(s) : s))
  if (toolIn(ws.tools, set) === tool && stages.every((s, i) => s === ws.stages[i])) return ws
  return { ...ws, stages, tools: { ...ws.tools, [set]: tool } }
}

// ステージでアイテムを置こうとする（同じアイテムなら取り消す）。置くのは選択の道具の仕事なので、そのステージの組の道具を選択にする。
// ほかのステージの置こうとしているアイテムはそのまま
export function togglePlacing(reg: Registry, ws: Workspace, id: string, item: ItemId): Workspace {
  const next = mapStage(ws, id, s => togglePlacingOn(s, item))
  const stage = next.stages.find(s => s.id === id)
  const set = stage ? toolSetOf(reg, stage) : null
  if (!stage?.placing || !set || toolIn(next.tools, set) === "select" || !hasTool(set, "select")) return next
  return { ...next, tools: { ...next.tools, [set]: "select" } }
}

// ステージに、開いているブックのページを開く
export function showPage(reg: Registry, ws: Workspace, stage: string, book: PagedBook, page: string): Workspace {
  return mapStage(ws, stage, s => openPage(reg, s, book, page))
}

// ブックが変わったとき、そのブックを開いている全部のステージを合わせる（stage.ts の followBook）
export function followBook(reg: Registry, ws: Workspace, book: Book): Workspace {
  const stages = ws.stages.map(s => followStage(reg, s, book))
  return stages.every((s, i) => s === ws.stages[i]) ? ws : { ...ws, stages }
}

// ブックの一覧が変わったとき: 無くなったブックを開いていたステージは何も開いていない状態にし、残ったブックには合わせる
export function followLibrary(reg: Registry, ws: Workspace, books: Readonly<Record<string, Book>>): Workspace {
  const stages = ws.stages.map(s => {
    const book = s.opened ? books[s.opened.book] : undefined
    if (!s.opened) return s
    return book ? followStage(reg, s, book) : closeBook(s)
  })
  return stages.every((s, i) => s === ws.stages[i]) ? ws : { ...ws, stages }
}
