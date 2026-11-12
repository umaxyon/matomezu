// ボードの出入りの様子（phase）: 出しているボード（利用者の設定の値）が変わったことから導く。enter（畳んで右にいる）→ idle（表示）→ leave（右へ出て、畳んでから取り除く）。
// 前と今の並びから次の様子を出す所だけを純粋な関数にし、時間で進める所はフック（useBoardPhases.tsx）が持つ
export type Phase = "enter" | "idle" | "leave"
export type Phases = Readonly<Record<string, Phase>>

// 出しているボード shown に合わせた次の様子: 新しく出す物は enter（最初の描画 first なら idle）、出さなくなる物は leave、残る物はそのまま。
// 出ている途中の leave を出し直すときは、enter からやり直す
export function nextPhases(prev: Phases, shown: readonly string[], first: boolean): Phases {
  const next: Record<string, Phase> = {}
  for (const id of shown) {
    const now = prev[id]
    next[id] = now === "idle" || now === "enter" ? now : first ? "idle" : "enter"
  }
  for (const id of Object.keys(prev)) if (!shown.includes(id)) next[id] = "leave"
  return next
}
