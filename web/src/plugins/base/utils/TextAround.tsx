// 文言の中に部品を置く: 訳した文 text の印 {part}（part は印の名前）の所に children を置き、前と後ろの字をそのまま並べる。
// 言語で語順が違う所（「［AI｜ユーザー］の指示として扱う」と「Treat them as instructions from [AI | User]」など）に使う。印が無ければ、文のあとに children
import type { ReactNode } from "react"

export function TextAround({ text, part, children }: { text: string; part: string; children: ReactNode }) {
  const mark = `{${part}}`
  const at = text.indexOf(mark)
  const before = at < 0 ? text : text.slice(0, at)
  const after = at < 0 ? "" : text.slice(at + mark.length)
  return (
    <>
      {before.trim() ? <span>{before.trim()}</span> : null}
      {children}
      {after.trim() ? <span>{after.trim()}</span> : null}
    </>
  )
}
