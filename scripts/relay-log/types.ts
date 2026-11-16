// relay-log の記録・ビューワー・report が読む型と、AI ごとの部品（clients/）の形。
// 本文の形は AI ごとに違うので部品の中に閉じ、ここには部品が出す共通の形だけを置く
export type ClientName = "claude" | "codex"

export type ResultSize = { id: string; tool: string; chars: number }
export type Summary = {
  model: string
  // 本文の並び（Claude Code は messages、Codex は input）の項目の数
  messages: number
  systemHash: string
  toolsHash: string
  // AI が毎回入れる指示（Claude Code は system、Codex は developer の message）
  systemChars: number
  toolsN: number
  toolsChars: number
  matomezuToolsN: number
  matomezuToolsChars: number
  textChars: number
  resultChars: number
  matomezuResultChars: number
  // cache_control の付いた所（tools[i]・system[i]・msg<i>[j]）と、その長さ（5m か 1h）。印の仕組みが無い AI では無い
  marks?: string[]
  // キャッシュの前置きと同じ順に積んだハッシュ。どこまでが何かは部品の divergeAt が知っている
  prefix: string[]
  results: ResultSize[]
}
export type Usage = Record<string, number>
// 部品がそろえた usage。input はキャッシュの外の入力、cacheRead はキャッシュから読んだ入力、cacheNew は新しくキャッシュに書いた入力。
// その AI の usage に無い値は無い
export type Tokens = { input?: number; cacheRead?: number; cacheNew?: number; output?: number }
export type Entry = {
  id: number
  client: ClientName
  at: string
  // 中継の URL の /s/<名前> の名前（無ければ unnamed）と、AI のセッション id
  session: string
  sessionId: string
  status: number
  ms: number
  stream: string
  // 同じ流れの前のリクエストと、前置きが最初に食い違った所。前が無いか、伸びただけなら none
  diverge: string
  summary: Omit<Summary, "prefix" | "results">
  // この中継で初めて見た道具の結果（同じ id は毎回送り直されるので、初めの 1 回だけ数える）
  newResults: ResultSize[]
  tokens: Tokens
  // API が返した usage を、入れ子のキーを . でつないで平らにした物
  usage: Usage
  error?: string
  // Claude Code が起動のときに残りの枠を確かめるリクエスト。429 が返っても作業の失敗ではない
  probe?: "quota"
  // 呼び手が返答の途中で接続を切った（usage と返答は切れた所まで）
  aborted?: true
}

export type Group = "matomezu" | "指示・メモリ" | "スキル" | "他の MCP" | "フック" | "会話" | "固定" | "不明"
export type Part = { where: string; label: string; group: Group; chars: number; text: string }

export type ReplyBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: string }
  | { type: "thinking"; text: string }
  // 部品が知らない種類の項目。中身は JSON のまま見せる
  | { type: "unknown"; text: string }

// 道具の呼び出しと、その結果。id で結ぶ。字数は結果を JSON にした長さ
export type ToolUse = { id: string; name: string; input: unknown }
export type ToolResult = { id: string; chars: number }

// 記録に置くときの本文の分け方。fixed は毎回ほぼ同じ大きな物、list は伸びていく並び。名前は本文のキーで、読み戻すときに同じキーに戻す
export type Split = {
  rest: Record<string, unknown>
  fixed: Record<string, unknown>
  list: { name: string; items: unknown[] }
}

// 並びの 1 項目から部品が取り出す事実。事実どうしを結ぶのは読むとき（timeline.ts）で、部品の外の共通の関数が受け持つ
// AI 間のメッセージの道: Claude Code の SendMessage と、matomezu の send_message
export type Via = "SendMessage" | "send_message"
// サブエージェントの呼び出し（Agent の tool_use）。callId は tool_use の id
export type Spawn = { callId: string; agentType: string; description: string }
// 呼び出しの結果から分かった、その呼び出しの子の id（スレッドの名前と同じ）
export type Started = { callId: string; agentId: string }
// 子の戻り: 同期の呼び出しの結果、非同期の子が止まった知らせ（task-notification）、子の報告（agent-message）
export type Return = { agentId: string; how: "result" | "notification" | "handback" }
// 送信。to は宛先（SendMessage はセッション名・uds: のアドレス・子の id、send_message はワークルーム名）
export type Send = { callId: string; via: Via; to: string; text: string }
// 受信。from は送った側のセッションの名前（SendMessage は from-name、send_message は送ったワークルームの名前）
export type Receipt = { via: Via; from: string; text: string }
export type ItemFacts = { spawns: Spawn[]; started: Started[]; returns: Return[]; sends: Send[]; receipts: Receipt[] }

// セッションの中の会話の糸（親と、サブエージェントの 1 つずつ）の、親の糸の名前
export const MAIN_THREAD = "main"
// サブエージェントの糸だが、子の id を記録に残していない物（どの子かは分からない）
export const UNNAMED_AGENT_THREAD = "unnamed-agent"

// AI ごとの部品。B はその AI の API のリクエストの本文の形
export type Client<B> = {
  name: ClientName
  // 中継の URL の道の頭（/codex など）。Claude Code は頭を付けない
  head: string
  upstream: string
  // 値を記録してよいヘッダー。ほかは名前だけを残す
  keepHeaders: Set<string>
  // 記録するリクエスト（上流へ渡す道で決める）
  recorded(method: string, path: string): boolean
  sessionIdOf(body: B, headers: Headers): string
  // 流れ: キャッシュの前置きを比べる単位（モデルや system が変われば、同じ会話の糸でも別の流れになる）
  streamOf(body: B, headers: Headers, summary: Summary): string
  // スレッド: 会話の糸。親は MAIN_THREAD、サブエージェントはその子の id
  threadOf(headers: Headers): string
  // join のあとに本文に入る「Workroom name: <名前>」の最後の 1 つ
  workroomNameOf(body: B): string | undefined
  summarize(body: B): Summary
  divergeAt(prev: string[] | undefined, cur: string[]): string
  classify(body: B): Part[]
  // SSE の 1 つのイベントのうち、usage として足す物
  usageOfEvent(event: { type?: string; [key: string]: unknown }): unknown
  // SSE の返答の終わりのイベントの type
  endEvent: string
  tokens(usage: Usage): Tokens
  parseReply(raw: string): ReplyBlock[]
  // 本文の並びの 1 つの項目にある、道具の呼び出しと結果
  toolUses(item: unknown): ToolUse[]
  toolResults(item: unknown): ToolResult[]
  factsOf(item: unknown): ItemFacts
  split(body: B): Split
  probeOf(body: B): Entry["probe"]
}
