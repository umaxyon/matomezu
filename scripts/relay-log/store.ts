// 中継の記録を SQLite に置く。リクエストの本文は毎回全文が送り直されるので、system・tools・メッセージを 1 つずつハッシュで
// 1 度だけ保存し、リクエストの行はハッシュの並びだけを持つ（そのまま保存すると会話が伸びるほど二乗で膨らむ）
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { Body, Entry } from "../relay-log"

type Skeleton = { rest: Record<string, unknown>; system?: string; tools?: string; messages: string[] }
export type NewEntry = Omit<Entry, "id">
export type SessionRow = { session: string; n: number; lastAt: string }

export type Store = ReturnType<typeof openStore>

export function openStore(path: string) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.run("PRAGMA journal_mode = WAL")
  db.run("CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, data TEXT NOT NULL)")
  db.run(
    "CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, session TEXT NOT NULL, entry TEXT NOT NULL, skeleton TEXT, reply TEXT)",
  )
  db.run("CREATE INDEX IF NOT EXISTS requests_session ON requests (session, id)")

  const putBlob = db.prepare("INSERT OR IGNORE INTO blobs (hash, data) VALUES (?, ?)")
  const blob = (value: unknown) => {
    const data = typeof value === "string" ? value : JSON.stringify(value)
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 20)
    putBlob.run(hash, data)
    return hash
  }
  const getBlob = db.prepare("SELECT data FROM blobs WHERE hash = ?")
  const read = (hash: string | undefined | null) =>
    hash ? (getBlob.get(hash) as { data: string } | null)?.data : undefined

  const insert = db.prepare("INSERT INTO requests (at, session, entry, skeleton, reply) VALUES (?, ?, ?, ?, ?)")
  const add = db.transaction((entry: NewEntry, body: Body | undefined, reply: string | undefined): number => {
    let skeleton: Skeleton | null = null
    if (body) {
      const { system, tools, messages, ...rest } = body
      skeleton = {
        rest,
        system: system === undefined ? undefined : blob(system),
        tools: tools === undefined ? undefined : blob(tools),
        messages: (messages ?? []).map(blob),
      }
    }
    const result = insert.run(
      entry.at,
      entry.session,
      JSON.stringify(entry),
      skeleton && JSON.stringify(skeleton),
      reply === undefined ? null : blob(reply),
    )
    return Number(result.lastInsertRowid)
  })

  const withId = (row: { id: number; entry: string }): Entry => ({ ...JSON.parse(row.entry), id: row.id })

  return {
    add,
    entries(session?: string, limit = 5000): Entry[] {
      const rows = (
        session
          ? db.query("SELECT id, entry FROM requests WHERE session = ? ORDER BY id DESC LIMIT ?").all(session, limit)
          : db.query("SELECT id, entry FROM requests ORDER BY id DESC LIMIT ?").all(limit)
      ) as { id: number; entry: string }[]
      return rows.reverse().map(withId)
    },
    sessions(): SessionRow[] {
      return db
        .query("SELECT session, COUNT(*) AS n, MAX(at) AS lastAt FROM requests GROUP BY session ORDER BY lastAt DESC")
        .all() as SessionRow[]
    },
    body(id: number): Body | undefined {
      const row = db.query("SELECT skeleton FROM requests WHERE id = ?").get(id) as { skeleton: string | null } | null
      if (!row?.skeleton) return undefined
      const s: Skeleton = JSON.parse(row.skeleton)
      const body: Record<string, unknown> = { ...s.rest }
      const system = read(s.system)
      const tools = read(s.tools)
      if (system !== undefined) body.system = JSON.parse(system)
      if (tools !== undefined) body.tools = JSON.parse(tools)
      body.messages = s.messages.map(h => JSON.parse(read(h) ?? "null"))
      return body as Body
    },
    reply(id: number): string | undefined {
      const row = db.query("SELECT reply FROM requests WHERE id = ?").get(id) as { reply: string | null } | null
      return read(row?.reply)
    },
    // before より前の行（無ければ全部）を消し、どの行からも指されなくなった本文も消す
    purge(before?: string): number {
      const result = before
        ? db.query("DELETE FROM requests WHERE at < ?").run(before)
        : db.query("DELETE FROM requests").run()
      const keep = new Set<string>()
      for (const row of db.query("SELECT skeleton, reply FROM requests").all() as {
        skeleton: string | null
        reply: string | null
      }[]) {
        if (row.reply) keep.add(row.reply)
        if (!row.skeleton) continue
        const s: Skeleton = JSON.parse(row.skeleton)
        for (const h of [s.system, s.tools, ...s.messages]) if (h) keep.add(h)
      }
      const drop = db.prepare("DELETE FROM blobs WHERE hash = ?")
      for (const row of db.query("SELECT hash FROM blobs").all() as { hash: string }[])
        if (!keep.has(row.hash)) drop.run(row.hash)
      db.run("VACUUM")
      return result.changes
    },
    blobCount(): number {
      return (db.query("SELECT COUNT(*) AS n FROM blobs").get() as { n: number }).n
    },
    close() {
      db.close()
    },
  }
}
