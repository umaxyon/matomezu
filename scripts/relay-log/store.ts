// 中継の記録を SQLite に置く。リクエストの本文は毎回全文が送り直されるので、部品が分けた「毎回ほぼ同じ大きな物」と「伸びていく並び」の
// 項目を 1 つずつハッシュで 1 度だけ保存し、リクエストの行はハッシュの並びだけを持つ（そのまま保存すると会話が伸びるほど二乗で膨らむ）。
// リクエストごとのスレッドと、並びの項目から取り出した事実（facts.ts）も持つ。事実は、スレッドの中で初めて現れたリクエストに 1 度だけ置く
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { clientOf } from "./clients"
import { FACTS_VERSION, type FactRow, factRows } from "./facts"
import type { McpFactRow } from "./mcp-rank"
import type { TimelineFact, TimelineRequest, TimelineRows } from "./timeline"
import { type ClientName, type Entry, MAIN_THREAD, type Split, type Usage } from "./types"

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
// 記録するときに事実を取り出す物: そのリクエストのスレッドと、本文の並びの項目（本文を残さないときも渡す）
export type FactsInput = { thread: string; items: unknown[] }

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
  db.run("CREATE INDEX IF NOT EXISTS requests_at ON requests (at)")
  // リクエストごとのスレッド。session_id は AI のセッション id（無い行は URL の名前）
  db.run(
    "CREATE TABLE IF NOT EXISTS threads (id INTEGER PRIMARY KEY, client TEXT NOT NULL, session_id TEXT NOT NULL, thread TEXT NOT NULL)",
  )
  db.run("CREATE INDEX IF NOT EXISTS threads_thread ON threads (client, session_id, thread, id)")
  // 事実。fact は、スレッドと事実の中身と、リクエストの中で同じ事実の何個目かのハッシュ。id は、その事実が初めて現れたリクエスト
  db.run(
    "CREATE TABLE IF NOT EXISTS facts (fact TEXT PRIMARY KEY, id INTEGER NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL)",
  )
  db.run("CREATE INDEX IF NOT EXISTS facts_id ON facts (id)")
  db.run("CREATE INDEX IF NOT EXISTS facts_kind ON facts (kind, key)")
  db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
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

  // ---- 事実 ----
  // 本文は毎回全文が送り直され、同じ項目でも形が変わって送られる（印の移動、文字列の本文とブロック、届いた文の前置きの行）ので、
  // 事実はリクエストの並び全体から取り出し、同じスレッドで同じ事実が同じ数だけ前にあれば置かない（同じ文が 2 度届けば 2 つ目も置く）。
  // 置いた事実は覚えておき、覚えの無い物（中継を立て直したあと）は表の主キーで重なりを捨てる
  type Prepared = { kind: string; key: string; data: string; body: string }
  const prepare = (rows: FactRow[]): Prepared[] =>
    rows.map(f => {
      const data = JSON.stringify(f.data)
      return { kind: f.kind, key: f.key, data, body: `${f.kind}\t${f.key}\t${data}` }
    })
  const seenFacts = new Set<string>()
  const putThread = db.prepare("INSERT OR REPLACE INTO threads (id, client, session_id, thread) VALUES (?, ?, ?, ?)")
  const putFact = db.prepare("INSERT OR IGNORE INTO facts (fact, id, kind, key, data) VALUES (?, ?, ?, ?, ?)")
  const record = (id: number, client: ClientName, sessionKey: string, thread: string, facts: Prepared[]) => {
    putThread.run(id, client, sessionKey, thread)
    const count = new Map<string, number>()
    for (const f of facts) {
      const nth = count.get(f.body) ?? 0
      count.set(f.body, nth + 1)
      const fact = `${client}\t${sessionKey}\t${thread}\t${nth}\t${f.body}`
      if (seenFacts.has(fact)) continue
      seenFacts.add(fact)
      putFact.run(createHash("sha256").update(fact).digest("hex").slice(0, 24), id, f.kind, f.key, f.data)
    }
  }

  // スレッドと事実の無い行に、骨組みから付け直す。取り出し方の版が変わっていれば、本文を残した行の分を消して全部作り直す
  // （本文を残していない行は、記録したときの物をそのまま残す。スレッドを付けていない行は親の糸にする）
  const refact = db.transaction(() => {
    const version = (db.query("SELECT value FROM meta WHERE key = 'facts'").get() as { value: string } | null)?.value
    if (version !== String(FACTS_VERSION)) {
      db.run("DELETE FROM facts WHERE id IN (SELECT id FROM requests WHERE skeleton IS NOT NULL)")
      db.run("DELETE FROM threads WHERE id IN (SELECT id FROM requests WHERE skeleton IS NOT NULL)")
      db.query("INSERT OR REPLACE INTO meta (key, value) VALUES ('facts', ?)").run(String(FACTS_VERSION))
    }
    const rows = db
      .query(
        "SELECT r.id, r.client, r.session, r.session_id, r.skeleton FROM requests r LEFT JOIN threads t ON t.id = r.id WHERE t.id IS NULL ORDER BY r.id",
      )
      .all() as { id: number; client: ClientName; session: string; session_id: string; skeleton: string | null }[]
    // 事実は、本文の項目（ハッシュ）ごとに 1 度だけ読んで取り出す
    const byBlob = new Map<string, Prepared[]>()
    for (const row of rows) {
      const sessionKey = row.session_id || row.session
      if (!row.skeleton) {
        record(row.id, row.client, sessionKey, MAIN_THREAD, [])
        continue
      }
      const s: Skeleton = JSON.parse(row.skeleton)
      const headers = new Headers((s.rest.headers ?? {}) as Record<string, string>)
      const facts = s.list.hashes.flatMap(h => {
        const cacheKey = `${row.client}:${h}`
        let it = byBlob.get(cacheKey)
        if (!it) {
          it = prepare(factRows(row.client, parse(h)))
          byBlob.set(cacheKey, it)
        }
        return it
      })
      record(row.id, row.client, sessionKey, clientOf(row.client).threadOf(headers), facts)
    }
  })

  const insert = db.prepare(
    "INSERT INTO requests (at, session, session_id, client, entry, skeleton, reply) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
  const setName = db.prepare("INSERT OR REPLACE INTO names (session_id, name) VALUES (?, ?)")
  // facts を渡さないときは、本文の並びから取り出し、スレッドは親の糸にする
  const add = db.transaction(
    (entry: NewEntry, body: Split | undefined, reply: string | undefined, facts?: FactsInput): number => {
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
      const id = Number(result.lastInsertRowid)
      const items = facts?.items ?? body?.list.items ?? []
      record(
        id,
        entry.client,
        entry.sessionId || entry.session,
        facts?.thread ?? MAIN_THREAD,
        prepare(items.flatMap(item => factRows(entry.client, item))),
      )
      return id
    },
  )

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
  refact()

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
    // matomezu の MCP 公開ツールの呼び出しと、その結果の事実を、結果が現れた順に（同じ呼び出しの結果は、送り直しや切り詰めで何度か現れる）
    mcpRows(session?: string, client?: ClientName): McpFactRow[] {
      const f = filter(session, client)
      return db
        .query(
          `SELECT res.key AS callId, c.data AS call, res.data AS result, r.client, r.at, ${label} AS session FROM facts res JOIN facts c ON c.kind = 'mcp-call' AND c.key = res.key JOIN requests r ON r.id = res.id LEFT JOIN names n ON n.session_id = r.session_id WHERE res.kind = 'result' ${f.sql ? `AND ${f.sql}` : ""} ORDER BY res.id`,
        )
        .all(...f.args) as McpFactRow[]
    },
    // from 以上 to 未満に始まったリクエストと、その事実。子のスレッドの呼び出しが期間より前にあっても、その呼び出しの事実と行を足す
    timeline(from: string, to: string): TimelineRows {
      const cols = `r.id, r.at, r.client, t.session_id AS sessionKey, t.thread, ${label} AS session, json_extract(r.entry, '$.status') AS status, json_extract(r.entry, '$.probe') AS probe, json_extract(r.entry, '$.tokens') AS tokens, json_extract(r.entry, '$.summary.resultChars') AS resultChars, json_extract(r.entry, '$.summary.matomezuResultChars') AS matomezuResultChars`
      const join = "FROM requests r JOIN threads t ON t.id = r.id LEFT JOIN names n ON n.session_id = r.session_id"
      type Row = Omit<TimelineRequest, "tokens"> & { tokens: string | null }
      const toRequest = (row: Row): TimelineRequest => ({ ...row, tokens: JSON.parse(row.tokens ?? "{}") })
      const requests = (
        db.query(`SELECT ${cols} ${join} WHERE r.at >= ? AND r.at < ? ORDER BY r.id`).all(from, to) as Row[]
      ).map(toRequest)
      const factCols = "f.id, f.kind, f.key, f.data"
      const facts = (
        db
          .query(
            `SELECT ${factCols} FROM facts f JOIN requests r ON r.id = f.id WHERE r.at >= ? AND r.at < ? AND f.kind NOT IN ('mcp-call', 'result') ORDER BY f.id`,
          )
          .all(from, to) as { id: number; kind: string; key: string; data: string }[]
      ).map(f => ({ ...f, data: JSON.parse(f.data) }) as TimelineFact)
      // スレッドの 1 つ前のリクエスト（スレッドの最初の行の分だけ、期間の外を引く）
      const prevOf = db.prepare(
        "SELECT p.id, r.at FROM threads p JOIN requests r ON r.id = p.id WHERE p.client = ? AND p.session_id = ? AND p.thread = ? AND p.id < ? ORDER BY p.id DESC LIMIT 1",
      )
      const last = new Map<string, { id: number; at: string }>()
      for (const r of requests) {
        const k = `${r.client}\t${r.sessionKey}\t${r.thread}`
        const prev =
          last.get(k) ?? (prevOf.get(r.client, r.sessionKey, r.thread, r.id) as { id: number; at: string } | null)
        if (prev) r.prev = prev
        last.set(k, { id: r.id, at: r.at })
      }
      const known = new Set(requests.map(r => r.id))
      const children = [...new Set(requests.map(r => r.thread))]
      const context: TimelineRequest[] = []
      if (children.length) {
        const started = db
          .query(
            `SELECT ${factCols} FROM facts f WHERE f.kind = 'started' AND f.key IN (${children.map(() => "?").join(",")})`,
          )
          .all(...children) as { id: number; kind: string; key: string; data: string }[]
        const calls = started.map(f => JSON.parse(f.data).callId as string)
        const spawns = calls.length
          ? (db
              .query(
                `SELECT ${factCols} FROM facts f WHERE f.kind = 'spawn' AND f.key IN (${calls.map(() => "?").join(",")})`,
              )
              .all(...calls) as { id: number; kind: string; key: string; data: string }[])
          : []
        const seen = new Set(facts.map(f => `${f.id}\t${f.kind}\t${f.key}`))
        for (const f of [...started, ...spawns]) {
          if (seen.has(`${f.id}\t${f.kind}\t${f.key}`)) continue
          facts.push({ ...f, data: JSON.parse(f.data) } as TimelineFact)
          if (known.has(f.id)) continue
          known.add(f.id)
          const row = db.query(`SELECT ${cols} ${join} WHERE r.id = ?`).get(f.id) as Row | null
          if (row) context.push(toRequest(row))
        }
      }
      return { from, to, requests, context, facts }
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
    usage(id: number): Usage {
      const row = db.query("SELECT json_extract(entry, '$.usage') AS usage FROM requests WHERE id = ?").get(id) as {
        usage: string | null
      } | null
      return row?.usage ? JSON.parse(row.usage) : {}
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
