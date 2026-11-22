// ホストに送る物の列: まだ確かめられていない自分のアクションバルク（1 つずつ順に送り、届かなければ送り直す）と、
// 送れるまで溜めておく AI 編集チケットの出来事とログの行。

import type { AIEditTicketOutcome, DoneBulk, HostAnswer, MatomezuInstance } from "../store/state"
import type { Net } from "./server"

export const RETRY_MS = 2000 // 届かなかったアクションを送り直すまで
const MAX_TRIES = 3 // 常駐が 5xx を返したアクションを送る回数（超えたら外す）
const MAX_LOG_LINES = 50 // 常駐に送れずに溜めておく、ログの行の数（超えたら古い方を捨てる。常駐が一度に受ける行の数と同じ）

// まだ確かめられていない自分のアクションバルク。sentTo は送り届けたつながりの番号（まだなら 0）、tries は常駐が 5xx を返した回数
interface Pending {
  seq: number
  key: string
  done: DoneBulk
  sentTo: number
  tries: number
  answer: (a: HostAnswer) => void // 常駐の答えを observe に返す
}

export interface SendQueueDeps {
  net: Net
  client: () => string // 常駐が振った窓の id（まだなら ""）
  online: () => boolean // 知らせにつながっているか
  link: () => number // 今のつながりの番号
  instance: () => MatomezuInstance | null
  show: () => void // 確かめた世界の上に、まだ確かめられていないアクションを出す
}

export function createSendQueue({ net, client, online, link, instance, show }: SendQueueDeps) {
  let pending: Pending[] = []
  let sending = false // 送っている途中か（1 つずつ順に送る）
  let retry: (() => void) | null = null // 送り直しの待ち（取り消す関数）
  let seq = 0
  let aiEditTickets: AIEditTicketOutcome[] = [] // 常駐にまだ送っていない、AI の変更を見た・見られる前に消えたこと
  // 溜めた物を 1 つずつ常駐に送る。送れなかった・常駐が 5xx を返したら戻して、次に送るときに送る（4xx なら捨てる。一度きりの出来事なので、送れないまま捨てない）
  const tellAIEditTickets = async () => {
    while (online() && client() && aiEditTickets.length > 0) {
      const [next, ...rest] = aiEditTickets as [AIEditTicketOutcome, ...AIEditTicketOutcome[]]
      aiEditTickets = rest
      const res = await net
        .fetch("api/ai-edit-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        })
        .catch(() => null)
      if (!res || res.status >= 500) {
        aiEditTickets = [next, ...aiEditTickets]
        return
      }
    }
  }
  let logLines: { at: string; text: string }[] = [] // 常駐のログにまだ送っていない行
  // 溜めた行を常駐のログに送る。送れなかった・常駐が 5xx を返したら戻して、次に送るときに一緒に送る（4xx なら捨てる）
  const tellLog = () => {
    if (!online() || !client() || logLines.length === 0) return
    const lines = logLines
    logLines = []
    const back = () => {
      logLines = [...lines, ...logLines].slice(-MAX_LOG_LINES)
    }
    void net
      .fetch("api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: client(), lines }),
      })
      .then(res => res.status >= 500 && back(), back)
  }
  // 画面のコンソールに出し、常駐のログにも書き残す（Error は名前と文、ほかの物は型の名前で書く）
  const logLine = (text: string, ...more: unknown[]) => {
    console.warn(text, ...more)
    const words = more.map(m =>
      m instanceof Error ? `${m.name}: ${m.message}` : typeof m === "object" && m ? m.constructor.name : String(m),
    )
    logLines = [...logLines, { at: new Date().toISOString(), text: [text, ...words].join(" ") }].slice(-MAX_LOG_LINES)
    tellLog()
  }
  // 番号 mark.seq までの自分のアクションを確かめ終える。ack なら、その番号のアクションに常駐の答え said を返す（ほかは行えた）
  const settle = (mark: { client?: string; seq?: number }, said?: HostAnswer) => {
    if (mark.client !== client() || mark.seq === undefined) return
    const upTo = mark.seq
    for (const p of pending) if (p.seq <= upTo) p.answer(p.seq === upTo && said ? said : { ok: true })
    pending = pending.filter(p => p.seq > upTo)
  }
  // 送り直しても届かなかったアクションバルクを外し、トーストで知らせる
  const drop = (p: Pending, why: string) => {
    logLine(`actions ${p.done.map(d => d.action).join(", ")} are not saved:`, why)
    pending = pending.filter(q => q !== p)
    p.answer({ ok: false, reason: "not-saved" })
    show()
    instance()?.actions.showToast({ kind: "warn", message: "An edit could not be saved" })
  }
  const later = (ms: number) => {
    retry?.()
    retry = net.later(() => {
      retry = null
      void pump()
    }, ms)
  }
  // まだ送り届けていないアクションを、今のつながりで 1 つずつ順に送る
  const pump = async () => {
    if (sending) return
    sending = true
    try {
      for (;;) {
        const next = pending.find(p => p.sentTo !== link())
        if (!online() || !next) return
        const to = client()
        const via = link()
        const res = await net
          .fetch("api/perform", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actions: next.done, client: to, seq: next.seq, key: next.key }),
          })
          .catch(() => null)
        if (!pending.includes(next)) continue // 送っている間に確かめ終わった
        // 送れなかった: つなぎ直したら送り直す（つながったままなら、しばらくして送り直す）
        if (!res) {
          later(RETRY_MS)
          return
        }
        if (res.ok) {
          next.sentTo = via // 送っている間につなぎ直したなら、前のつながりの答えは届かないので、新しいつながりで送り直す
          continue
        }
        next.tries += 1
        if (res.status < 500 || next.tries >= MAX_TRIES) {
          drop(next, `${res.status}`)
          continue
        }
        later(RETRY_MS)
        return
      }
    } finally {
      sending = false
    }
  }
  return {
    // まだ確かめられていないアクションバルク（送った順）
    bulks: (): DoneBulk[] => pending.map(p => p.done),
    // まだ確かめられていないアクションバルクの数
    count: () => pending.length,
    // アクションバルク done を列に足して送る。常駐の答えを返す
    add: (done: DoneBulk) =>
      new Promise<HostAnswer>(answer => {
        seq += 1
        pending.push({ seq, key: net.newKey(), done, sentTo: 0, tries: 0, answer })
        void pump()
      }),
    // まだ確かめられていないアクションバルクを送らずに捨て、その数を返す（データの形が違う常駐には送らない）
    discard: () => {
      const dropped = pending
      pending = []
      retry?.()
      retry = null
      for (const p of dropped) p.answer({ ok: false, reason: "not-saved" })
      return dropped.length
    },
    settle,
    pump,
    tellAIEditTickets,
    // AI の変更を見た・見られる前に消えたことを溜めて送る
    reportAIEditTicket: (change: AIEditTicketOutcome) => {
      aiEditTickets = [...aiEditTickets, change]
      void tellAIEditTickets()
    },
    tellLog,
    logLine,
  }
}
