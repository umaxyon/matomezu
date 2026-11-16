// /timeline の中身: 期間のリクエストを、セッションとスレッドの帯に並べ、記録した事実（facts.ts）どうしを結んで矢印にする。
// 結んだ結果は保存せず、読むたびにここで作る。期間の外の相手とは結ばない（子の呼び出しの事実だけは、帯の名前と親を決めるために期間の外からも引く）
//
// 矢印の両端の時刻:
//   道具の呼び出し（Agent・SendMessage・send_message）はリクエスト N の返答で生まれ、並びの項目としては N+1 で初めて記録される。
//   起点は、その項目が初めて現れたリクエストの、同じスレッドで 1 つ前のリクエスト（無ければ、そのリクエスト）
//   受け手の側は、受信（戻り・届いた文）が初めて現れたリクエスト。子の呼び出しと再開は、子のスレッドの起点より後の最初のリクエスト
import type { ClientName, Return, Tokens, Via } from "./types"
import { MAIN_THREAD, UNNAMED_AGENT_THREAD } from "./types"

export type TimelineRequest = {
  id: number
  at: string
  client: ClientName
  // スレッドを分けるセッションの鍵（AI のセッション id、無ければ URL の名前）と、表示の名前
  sessionKey: string
  session: string
  thread: string
  status: number
  probe: string | null
  tokens: Tokens
  resultChars: number | null
  matomezuResultChars: number | null
  // 同じスレッドで 1 つ前のリクエスト
  prev?: { id: number; at: string }
}
export type TimelineFact = { id: number } & (
  | { kind: "spawn"; key: string; data: { agentType: string; description: string } }
  | { kind: "started"; key: string; data: { callId: string } }
  | { kind: "return"; key: string; data: { how: Return["how"] } }
  | { kind: "send"; key: string; data: { via: Via; to: string; text: string } }
  | { kind: "receipt"; key: string; data: { via: Via; text: string } }
)
// store の timeline が返す物。requests は期間の中のリクエスト、context は期間の外にある子の呼び出しのリクエスト
export type TimelineRows = {
  from: string
  to: string
  requests: TimelineRequest[]
  context: TimelineRequest[]
  facts: TimelineFact[]
}

export type End = { id: number; at: string; session: string; thread: string }
// call は子の呼び出し、return は子の戻り、resume は親が止まった子を続けさせる SendMessage、SendMessage と send_message はセッション間のメッセージ
export type ArrowKind = "call" | "return" | "resume" | Via
export type Arrow = { kind: ArrowKind; from: End; to: End }
// context はコンテキストの大きさ（input + cacheRead + cacheNew）
export type TimelinePoint = { id: number; at: string; context: number; mark?: "error" | "probe" }
// agent は子を呼び出したときの種類と説明（呼び出しが記録に無ければ無い）
export type TimelineThread = {
  thread: string
  parent?: string
  depth: number
  agent?: { type: string; description: string }
  points: TimelinePoint[]
}
// matomezuShare は、期間のリクエストの結果の字数の和のうち matomezu の結果の割合（リクエストごとに送り直される分も重ねて数える）
export type SessionStats = {
  requests: number
  input: number
  cacheRead: number
  cacheNew: number
  output: number
  cacheRate: number | null
  maxContext: number
  matomezuShare: number | null
}
export type TimelineSession = {
  session: string
  client: ClientName
  lastAt: string
  threads: TimelineThread[]
  stats: SessionStats
}
export type Timeline = { from: string; to: string; sessions: TimelineSession[]; arrows: Arrow[] }

const contextOf = (t: Tokens) => (t.input ?? 0) + (t.cacheRead ?? 0) + (t.cacheNew ?? 0)

const endOf = (r: TimelineRequest): End => ({ id: r.id, at: r.at, session: r.session, thread: r.thread })
const originOf = (r: TimelineRequest): End => (r.prev ? { ...endOf(r), ...r.prev } : endOf(r))

function statsOf(rows: TimelineRequest[]): SessionStats {
  const sum = (f: (r: TimelineRequest) => number | null | undefined) => rows.reduce((n, r) => n + (f(r) ?? 0), 0)
  const input = sum(r => r.tokens.input)
  const cacheRead = sum(r => r.tokens.cacheRead)
  const cacheNew = sum(r => r.tokens.cacheNew)
  const results = sum(r => r.resultChars)
  const all = input + cacheRead + cacheNew
  return {
    requests: rows.length,
    input,
    cacheRead,
    cacheNew,
    output: sum(r => r.tokens.output),
    cacheRate: all ? cacheRead / all : null,
    maxContext: Math.max(0, ...rows.map(r => contextOf(r.tokens))),
    matomezuShare: results ? sum(r => r.matomezuResultChars) / results : null,
  }
}

export function timeline({ from, to, requests, context, facts }: TimelineRows): Timeline {
  const byId = new Map([...context, ...requests].map(r => [r.id, r]))
  const inWindow = new Set(requests.map(r => r.id))
  const of = <K extends TimelineFact["kind"]>(kind: K) =>
    facts.filter((f): f is Extract<TimelineFact, { kind: K }> => f.kind === kind && byId.has(f.id))

  // セッション（表示の名前）ごとの、スレッドごとのリクエスト
  type Rows = { client: ClientName; rows: TimelineRequest[]; threads: Map<string, TimelineRequest[]> }
  const sessions = new Map<string, Rows>()
  for (const r of requests) {
    const s: Rows = sessions.get(r.session) ?? { client: r.client, rows: [], threads: new Map() }
    s.rows.push(r)
    const rows = s.threads.get(r.thread) ?? []
    rows.push(r)
    s.threads.set(r.thread, rows)
    sessions.set(r.session, s)
  }
  const threadRows = (session: string, thread: string) => sessions.get(session)?.threads.get(thread)

  const spawnOf = new Map(of("spawn").map(f => [f.key, f]))
  const agentOfCall = new Map<string, string>()
  const callOfAgent = new Map<string, string>()
  for (const f of of("started")) {
    if (!agentOfCall.has(f.data.callId)) agentOfCall.set(f.data.callId, f.key)
    if (!callOfAgent.has(f.key)) callOfAgent.set(f.key, f.data.callId)
  }
  const spawnOfAgent = (agentId: string) => {
    const callId = callOfAgent.get(agentId)
    return callId ? spawnOf.get(callId) : undefined
  }

  const arrows: Arrow[] = []
  // 子の呼び出し
  for (const f of of("spawn")) {
    const r = byId.get(f.id)
    const agentId = agentOfCall.get(f.key)
    if (!r || !inWindow.has(r.id) || !agentId) continue
    const first = threadRows(r.session, agentId)?.[0]
    if (first) arrows.push({ kind: "call", from: originOf(r), to: endOf(first) })
  }
  // 子の戻り。同じ子の同じリクエストから出る戻り（報告と、止まった知らせ）は、先の 1 つにまとめる
  const lastFrom = new Map<string, number>()
  for (const f of of("return")) {
    const r = byId.get(f.id)
    const child = r && threadRows(r.session, f.key)
    if (!r || !child || !inWindow.has(r.id)) continue
    const last = child.filter(c => c.id < r.id).at(-1)
    if (!last || lastFrom.get(`${r.session}\t${f.key}`) === last.id) continue
    lastFrom.set(`${r.session}\t${f.key}`, last.id)
    arrows.push({ kind: "return", from: endOf(last), to: endOf(r) })
  }
  // 再開と、セッション間のメッセージ
  type Sent = { origin: End; to: string; sender: string; used: boolean }
  const sent = new Map<string, Sent[]>()
  for (const f of of("send")) {
    const r = byId.get(f.id)
    if (!r || !inWindow.has(r.id)) continue
    const origin = originOf(r)
    const child = f.data.via === "SendMessage" ? threadRows(r.session, f.data.to) : undefined
    if (child) {
      const next = child.find(c => c.id > origin.id)
      if (next) arrows.push({ kind: "resume", from: origin, to: endOf(next) })
      continue
    }
    const key = `${f.data.via}\t${f.data.text}`
    sent.set(key, [...(sent.get(key) ?? []), { origin, to: f.data.to, sender: r.session, used: false }])
  }
  // 受信は文で送信と結ぶ。送り手の名前（from-name・ワークルーム名）が送信のセッションの名前と合う物、宛先が受け手のセッションの
  // 名前と合う物があれば、そちらに絞る（同じ文を何人かに送ったときと、名前が表示の名前と違うセッション）。絞っても 2 つ以上残る
  // ときだけ、受信より前の送信のうち早い物から、時刻の順に結ぶ
  const receipts = of("receipt")
    .map(f => ({ f, r: byId.get(f.id) as TimelineRequest }))
    .sort((a, b) => a.r.at.localeCompare(b.r.at))
  const narrow = (xs: Sent[], keep: (s: Sent) => boolean) => {
    const kept = xs.filter(keep)
    return kept.length ? kept : xs
  }
  for (const { f, r } of receipts) {
    const all = (sent.get(`${f.data.via}\t${f.data.text}`) ?? []).filter(s => !s.used)
    let candidates = narrow(
      narrow(all, s => s.sender === f.key),
      s => s.to === r.session,
    )
    if (candidates.length > 1)
      candidates = candidates.filter(s => s.origin.at <= r.at).sort((a, b) => a.origin.at.localeCompare(b.origin.at))
    const s = candidates[0]
    if (!s) continue
    s.used = true
    arrows.push({ kind: f.data.via, from: s.origin, to: endOf(r) })
  }

  const out: TimelineSession[] = [...sessions].map(([session, s]) => {
    // 親のスレッド: 子を呼び出したリクエストのスレッド。呼び出しが無いか、親が期間に無ければ親の糸の下
    const parentOf = (thread: string) => {
      if (thread === MAIN_THREAD) return undefined
      const spawn = thread === UNNAMED_AGENT_THREAD ? undefined : spawnOfAgent(thread)
      const parent = spawn && byId.get(spawn.id)?.thread
      return parent && parent !== thread && s.threads.has(parent) ? parent : MAIN_THREAD
    }
    const threads: TimelineThread[] = []
    const visited = new Set<string>()
    const visit = (thread: string, depth: number) => {
      if (visited.has(thread)) return
      visited.add(thread)
      const rows = s.threads.get(thread) ?? []
      const spawn = spawnOfAgent(thread)
      threads.push({
        thread,
        ...(thread === MAIN_THREAD ? {} : { parent: parentOf(thread) }),
        depth,
        ...(spawn ? { agent: { type: spawn.data.agentType, description: spawn.data.description } } : {}),
        points: rows.map(r => ({
          id: r.id,
          at: r.at,
          context: contextOf(r.tokens),
          ...(r.probe ? { mark: "probe" as const } : r.status >= 400 ? { mark: "error" as const } : {}),
        })),
      })
      const kids = [...s.threads.keys()]
        .filter(t => t !== thread && parentOf(t) === thread)
        .sort((a, b) => (s.threads.get(a)?.[0]?.id ?? 0) - (s.threads.get(b)?.[0]?.id ?? 0))
      for (const k of kids) visit(k, depth + 1)
    }
    visit(MAIN_THREAD, 0)
    // 親の糸のリクエストが期間に無いセッションでは、親の帯を空で置く（子の帯をその下に並べるため）
    return {
      session,
      client: s.client,
      lastAt: s.rows.reduce((a, r) => (r.at > a ? r.at : a), ""),
      threads,
      stats: statsOf(s.rows),
    }
  })
  out.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  return { from, to, sessions: out, arrows }
}
