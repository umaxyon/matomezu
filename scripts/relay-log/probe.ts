import type { Body, Entry } from "../relay-log"

// Claude Code が起動のときに残りの枠を確かめるリクエスト: max_tokens が 1 で、本文が "quota" の 1 通だけ
export function probeOf(body: Body & { max_tokens?: number }): Entry["probe"] {
  const only = body.messages?.length === 1 ? body.messages[0] : undefined
  const text = typeof only?.content === "string" ? only.content : undefined
  return body.max_tokens === 1 && text === "quota" ? "quota" : undefined
}
