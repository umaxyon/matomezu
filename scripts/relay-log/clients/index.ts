// 中継が受け持つ AI の部品の表
import type { Client, ClientName } from "../types"
import { claude } from "./claude"
import { codex } from "./codex"

export const clients: Record<ClientName, Client<never>> = { claude, codex }

// 記録の行の AI の部品。本文の形はその部品だけが知っている
export const clientOf = (name: ClientName) => clients[name] as unknown as Client<unknown>

// 道の頭が合う部品。どれにも合わなければ、頭を付けない Claude Code
export function clientOfPath(pathname: string): Client<unknown> {
  const hit = Object.values(clients).find(c => c.head && (pathname === c.head || pathname.startsWith(`${c.head}/`)))
  return (hit ?? claude) as unknown as Client<unknown>
}
