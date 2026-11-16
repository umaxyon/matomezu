// 中継の記録を SQLite に置く。リクエストの本文は毎回全文が送り直されるので、部品が分けた「毎回ほぼ同じ大きな物」と「伸びていく並び」の
// 項目を 1 つずつハッシュで 1 度だけ保存し、リクエストの行はハッシュの並びだけを持つ（そのまま保存すると会話が伸びるほど二乗で膨らむ）
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { clientOf } from "./clients"
import type { ClientName, Entry, Split } from "./types"

// fixed と list の名前は本文のキー。読み戻すときに同じキーに戻す
type Skeleton = {
  rest: Record<string, unknown>
  fixed: Record<string, string>
  list: { name: string; hashes: string[] }
}
// 名前付きの骨組みでない行の形（Claude Code の本文の system・tools・messages のキー）
type ClaudeSkeleton = { rest: Record<string, unknown>; system?: string; tools?: string; messages: string[] }
export type NewEntry = Omit<Entry, "id">
export type SessionRow = { session: string; n: number; lastAt: string }
export type StoredItem = { session: string; client: ClientName; at: string; item: unknown }

export type Store = ReturnType<typeof openStore>

const hashesOf = (s: Skeleton) => [...Object.values(s.fixed), ...s.list.hashes]

export function openStore(path: string) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.run("PRAGMA journal_mode = WAL")
  db.run("CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, data TEXT NOT NULL)")
  db.run(
    "CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, session TEXT NOT NULL, session_id TEXT NOT NULL DEFAULT '', client TEXT NOT NULL DEFAULT 'claude', entry TEXT NOT NULL, skeleton TEXT, reply TEXT)",
  )
  const columns = db.query("PRAGMA table_info(requests)").all() as { name: string }[]
  if (!columns.some(c => c.name === "session_id")) {
    db.run("ALTER TABLE requests ADD COLUMN session_id TEXT NOT NULL DEFAULT ''")
    db.run("UPDATE requests SET session_id = COALESCE(json_extract(entry, '$.sessionId'), '')")
  }
  if (!columns.some(c => c.name === "client"))
    db.run("ALTER TABLE requests ADD COLUMN client TEXT NOT NULL DEFAULT 'claude'")
  db.run("CREATE INDEX IF NOT EXISTS requests_session ON requests (session, id)")
  // join で決まったワークルーム名（AI のセッション id ごとに、最後に見た名前）
  db.run("CREATE TABLE IF NOT EXISTS names (session_id TEXT PRIMARY KEY, name TEXT NOT NULL)")
  // 一覧に出すセッションの名前: join の名前、無ければ URL で付けた名前、無ければ session_id の 8 字。Codex の session_id は
  // 頭が時刻の UUID（v7）で、近い時刻に始めたセッションの頭がそろうので、後ろの 8 字にする
  const short = "CASE r.client WHEN 'codex' THEN substr(r.session_id, -8) ELSE substr(r.session_id, 1, 8) END"
  const label = `COALESCE(n.name, NULLIF(r.session, 'unnamed'), NULLIF(${short}, ''), 'unnamed')`
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
  const parse = (hash: string) => JSON.parse(read(hash) ?? "null")

  const assemble = (s: Skeleton): Record<string, unknown> => ({
    ...s.rest,
    ...Object.fromEntries(Object.entries(s.fixed).map(([k, h]) => [k, parse(h)])),
    [s.list.name]: s.list.hashes.map(parse),
  })

  // 本文の骨組みを名前付きの形に、entry に AI とそろえた usage を足す。どちらも持っていない行だけを直すので、何度開いてもよい
  const migrate = db.transaction(() => {
    const skeletons = db
      .query(
        "SELECT id, skeleton FROM requests WHERE skeleton IS NOT NULL AND json_extract(skeleton, '$.list') IS NULL",
      )
      .all() as { id: number; skeleton: string }[]
    for (const row of skeletons) {
      const { rest, system, tools, messages }: ClaudeSkeleton = JSON.parse(row.skeleton)
      const fixed: Record<string, string> = {}
      if (system) fixed.system = system
      if (tools) fixed.tools = tools
      const next: Skeleton = { rest, fixed, list: { name: "messages", hashes: messages } }
      db.query("UPDATE requests SET skeleton = ? WHERE id = ?").run(JSON.stringify(next), row.id)
    }
    const entries = db
      .query(
        "SELECT id, client, entry FROM requests WHERE json_extract(entry, '$.tokens') IS NULL OR json_extract(entry, '$.client') IS NULL",
      )
      .all() as { id: number; client: ClientName; entry: string }[]
    for (const row of entries) {
      const e = JSON.parse(row.entry)
      const next = { ...e, client: row.client, tokens: e.tokens ?? clientOf(row.client).tokens(e.usage ?? {}) }
      db.query("UPDATE requests SET entry = ? WHERE id = ?").run(JSON.stringify(next), row.id)
    }
  })

  // probe の無い行に、本文から付け直す（本文を残していない行は付けられない）。枠の確かめは Claude Code だけ
  const markProbes = () => {
    const rows = db
      .query(
        "SELECT id, entry, skeleton FROM requests WHERE client = 'claude' AND json_extract(entry, '$.status') >= 400 AND json_extract(entry, '$.probe') IS NULL AND skeleton IS NOT NULL",
      )
      .all() as { id: number; entry: string; skeleton: string }[]
    for (const row of rows) {
      const probe = clientOf("claude").probeOf(assemble(JSON.parse(row.skeleton)))
      if (probe)
        db.query("UPDATE requests SET entry = ? WHERE id = ?").run(
          JSON.stringify({ ...JSON.parse(row.entry), probe }),
          row.id,
        )
    }
  }

  const insert = db.prepare(
    "INSERT INTO requests (at, session, session_id, client, entry, skeleton, reply) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
  const setName = db.prepare("INSERT OR REPLACE INTO names (session_id, name) VALUES (?, ?)")
  const add = db.transaction((entry: NewEntry, body: Split | undefined, reply: string | undefined): number => {
    const skeleton: Skeleton | null = body
      ? {
          rest: body.rest,
          fixed: Object.fromEntries(Object.entries(body.fixed).map(([k, v]) => [k, blob(v)])),
          list: { name: body.list.name, hashes: body.list.items.map(blob) },
        }
      : null
    const result = insert.run(
      entry.at,
      entry.session,
      entry.sessionId,
      entry.client,
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

  // 表示の名前（label）と AI で絞る
  const filter = (session?: string, client?: ClientName) => {
    const conds = [...(session ? [`${label} = ?`] : []), ...(client ? ["r.client = ?"] : [])]
    return { sql: conds.join(" AND "), args: [...(session ? [session] : []), ...(client ? [client] : [])] }
  }

  migrate()
  markProbes()

  return {
    add,
    entries(session?: string, client?: ClientName, limit = 5000): Entry[] {
      const f = filter(session, client)
      const rows = db
        .query(
          `SELECT r.id, r.entry, ${label} AS label ${from} ${f.sql ? `WHERE ${f.sql}` : ""} ORDER BY r.id DESC LIMIT ?`,
        )
        .all(...f.args, limit) as { id: number; entry: string; label: string }[]
      return rows.reverse().map(withId)
    },
    sessions(client?: ClientName): SessionRow[] {
      const f = filter(undefined, client)
      return db
        .query(
          `SELECT ${label} AS session, COUNT(*) AS n, MAX(r.at) AS lastAt ${from} ${f.sql ? `WHERE ${f.sql}` : ""} GROUP BY ${label} ORDER BY lastAt DESC`,
        )
        .all(...f.args) as SessionRow[]
    },
    // 記録にある並びの項目を、最初に送られたリクエストの順に 1 度ずつ
    uniqueItems(session?: string, client?: ClientName): StoredItem[] {
      const f = filter(session, client)
      const rows = db
        .query(
          `SELECT r.at, r.client, r.skeleton, ${label} AS label ${from} WHERE r.skeleton IS NOT NULL ${f.sql ? `AND ${f.sql}` : ""} ORDER BY r.id`,
        )
        .all(...f.args) as { at: string; client: ClientName; skeleton: string; label: string }[]
      const seen = new Set<string>()
      const out: StoredItem[] = []
      for (const row of rows) {
        const s: Skeleton = JSON.parse(row.skeleton)
        for (const h of s.list.hashes) {
          if (seen.has(h)) continue
          seen.add(h)
          const data = read(h)
          if (data !== undefined)
            out.push({ session: row.label, client: row.client, at: row.at, item: JSON.parse(data) })
        }
      }
      return out
    },
    setName(sessionId: string, name: string) {
      if (sessionId) setName.run(sessionId, name)
    },
    clientOf(id: number): ClientName | undefined {
      return (db.query("SELECT client FROM requests WHERE id = ?").get(id) as { client: ClientName } | null)?.client
    },
    body(id: number): Record<string, unknown> | undefined {
      const row = db.query("SELECT skeleton FROM requests WHERE id = ?").get(id) as { skeleton: string | null } | null
      return row?.skeleton ? assemble(JSON.parse(row.skeleton)) : undefined
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
        if (row.skeleton) for (const h of hashesOf(JSON.parse(row.skeleton))) keep.add(h)
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
