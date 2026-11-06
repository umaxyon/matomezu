// 郵便のダイアログの開くボタン: 画面の分割の状態から、どのボタンを並べ、どれを決めるボタン（Enter）にするかを決める純粋な計算と、押したボタンで開くステージ。
// 1 画面なら「開く」（このステージ）と「分割で開く」（右に分けたステージ）、2 画面なら「左に開く」「右に開く」。決めるボタンは、ダイアログを出したステージで開くボタン
import type { Workspace } from "../../../core/workspace"

export type OpenChoice = "here" | "split" | "left" | "right"

export interface OpenChoices {
  opens: readonly OpenChoice[] // 左から並べる順
  primary: OpenChoice
}

// ダイアログを出したステージ stage で、行き先がある郵便の開くボタン（stage が無ければ、ボタンを出さない）
export function openChoices(ws: Pick<Workspace, "stages">, stage: string): OpenChoices | null {
  const index = ws.stages.findIndex(s => s.id === stage)
  if (index < 0) return null
  if (ws.stages.length === 1) return { opens: ["here", "split"], primary: "here" }
  return { opens: ["left", "right"], primary: index === 0 ? "left" : "right" }
}

// 押したボタン choice で開くステージ（"split" は分けたあとの並びで、stage の右）
export function openStageOf(ws: Pick<Workspace, "stages">, stage: string, choice: OpenChoice): string | null {
  const index = ws.stages.findIndex(s => s.id === stage)
  if (index < 0) return null
  const at = choice === "here" ? index : choice === "split" ? index + 1 : choice === "left" ? 0 : 1
  return ws.stages[at]?.id ?? null
}
