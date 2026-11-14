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
    "CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, session TEXT NOT NULL, session_id TEXT NOT NULL DEFAULT '', entry TEXT NOT NULL, skeleton TEXT, reply TEXT)",
  )
  const columns = db.query("PRAGMA table_info(requests)").all() as { name: string }[]
  if (!columns.some(c => c.name === "session_id")) {
    db.run("ALTER TABLE requests ADD COLUMN session_id TEXT NOT NULL DEFAULT ''")
    db.run("UPDATE requests SET session_id = COALESCE(json_extract(entry, '$.sessionId'), '')")
  }
  db.run("CREATE INDEX IF NOT EXISTS requests_session ON requests (session, id)")
  // join で決まったワークルーム名（Claude Code のセッション id ごとに、最後に見た名前）
  db.run("CREATE TABLE IF NOT EXISTS names (session_id TEXT PRIMARY KEY, name TEXT NOT NULL)")
  // 一覧に出すセッションの名前: join の名前、無ければ URL で付けた名前、無ければ session_id の頭 8 字
  const label = "COALESCE(n.name, NULLIF(r.session, 'unnamed'), NULLIF(substr(r.session_id, 1, 8), ''), 'unnamed')"
  const from = "FROM requests r LEFT JOIN names n ON n.session_id = r.session_id"

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

  const insert = db.prepare(
    "INSERT INTO requests (at, session, session_id, entry, skeleton, reply) VALUES (?, ?, ?, ?, ?, ?)",
  )
  const setName = db.prepare("INSERT OR REPLACE INTO names (session_id, name) VALUES (?, ?)")
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
      entry.sessionId,
      JSON.stringify(entry),
      skeleton && JSON.stringify(skeleton),
      reply === undefined ? null : blob(reply),
    )
    return Number(result.lastInsertRowid)
  })

  const withId = (row: { id: number; entry: string; label: string }): Entry => ({
    ...JSON.parse(row.entry),
    session: row.label,
    id: row.id,
  })

  return {
    add,
    // session は表示の名前（label）で絞る
    entries(session?: string, limit = 5000): Entry[] {
      const where = session ? `WHERE ${label} = ?` : ""
      const rows = db
        .query(`SELECT r.id, r.entry, ${label} AS label ${from} ${where} ORDER BY r.id DESC LIMIT ?`)
        .all(...(session ? [session, limit] : [limit])) as { id: number; entry: string; label: string }[]
      return rows.reverse().map(withId)
    },
    sessions(): SessionRow[] {
      return db
        .query(
          `SELECT ${label} AS session, COUNT(*) AS n, MAX(r.at) AS lastAt ${from} GROUP BY ${label} ORDER BY lastAt DESC`,
        )
        .all() as SessionRow[]
    },
    setName(sessionId: string, name: string) {
      if (sessionId) setName.run(sessionId, name)
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
      db.run("DELETE FROM names WHERE session_id NOT IN (SELECT session_id FROM requests)")
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
