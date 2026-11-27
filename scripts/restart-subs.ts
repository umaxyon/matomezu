// Orca の端末で動くサブの Claude Code を、まとめて出直させる。既定は clear で出直す型（プロセスはそのまま、会話を空にする）。
// プロセスの中身を替えるとき（--relaunch・--env・--no-relay・モデルの指定）だけ、起動し直す型にする
//   bun scripts/restart-subs.ts [--dry-run] [--timeout-min <分>] [--relaunch] [--env <KEY=VAL>]... [--no-relay] <サブ>...
//   --relaunch: 起動し直す型にする
//   --env: 起動する claude に渡す環境変数（Code Mode などを試すとき）。渡したサブだけに効き、次に --env なしで起動し直せば外れる
//   --no-relay: claude-relay.sh を通さず claude を直に起動する。次に付けずに起動し直せば中継に戻る
//   <サブ> は sub4（sub4_work の略）・sub4_work・main_manager などのワークルーム名、モデルを指定するなら sub6:claude-fable-5-2（無ければ最後の会話のモデル）
// サブごとに並行して、次の順に進める。どこかで止まったサブは、そこで止めて理由を出す
//   1. 出直しの準備（引き継ぎを書き、未コミットを残さない）を頼み、手が空くのを待つ
//   2. 最後の返事が READY_MARK で終わり、追跡するファイルに変更が無ければ、取り込みのキューのロックを取る。
//      ロックは /reload-plugins と /mcp reconnect を送り終えるまで持つ（キューが入れたあとに常駐とプラグインのキャッシュを作り直している間に出直さない）。
//      その worktree がキューに並んでいれば（merge-request.ts の印）、はじめとロックを取ったあとに止める（待っている結果がサブに届かなくなる）
//   clear で出直す型
//   3. /clear・/reload-plugins・/mcp reconnect を送り、引き継ぎを読むよう頼む（continuePrompt）。参加者は前の会話から新しい会話に移る（join し直さない）
//   4. そのターンのフックが同じワークルームへの参加を伝えたかを BOUND_WAIT_MS まで待つ。伝えなければ止める
//   起動し直す型
//   3. /exit を送り、claude が終わるのを待つ。scripts/claude-relay.sh --model <モデル> を送り（--env があれば KEY=VAL を前に付け、--no-relay なら claude を直に）、
//      起動した claude の引数と環境変数がそのとおりかを確かめ（違えば止める）、/reload-plugins と /mcp reconnect を送り、引き継ぎを読んで join するよう頼む。
//      join の合言葉（link）はここで作り、開発の常駐に前もって承認させておく（画面で受け入れずに入る。開発用の口 /api/dev/rejoin-pass）
//   4. join が参加者 id を返したら、手が空くのを待ち、ターンの始まりのフックが参加を伝えたか（セッションと参加者を結んだか）を BOUND_WAIT_MS まで待つ。
//      合言葉の受け入れの起こす知らせで、watch がターンを始めるはず。伝えなければ、もう一言（CONFIRM_PROMPT）送る。結ぶのはそのフックなので、
//      どのターンも始まらないと、画面で準備中のまま残る
// 終わりに、サブごとの結果を「結果: 」の 1 行にまとめて出す。全部が参加すれば 0 で終わる
// サブは Orca にエージェントとして見えない（claude-relay.sh で起動するため）ので、Orca の端末に打ち込んで進める。
// 端末は、そのワークルームに参加している claude のプロセスから探す（workroomOf・terminalOf）
import { execFile, execFileSync, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, readdirSync, readFileSync, readlinkSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import { commonDir, queueLock } from "./merge-queue"
import { queuedRequests } from "./merge-request"

export const READY_MARK = "再起動の準備OK"
export const NG_MARK = "再起動の準備NG"
export const MCP_SERVER = "plugin:matomezu:matomezu"

export const CONFIRM_PROMPT = "参加の確かめです。返事は短く"
// join の返事のあと、フックが参加を伝えるのを待つ長さ（伝えなければ CONFIRM_PROMPT を送る）
const BOUND_WAIT_MS = 120_000

export type Target = { workroom: string; model?: string }

export function parseTarget(arg: string): Target {
  const [name, model] = arg.split(":", 2) as [string, string | undefined]
  // subN だけは subN_work の略として読む（main_manager などはそのまま）
  const workroom = /^sub\d+$/.test(name) ? `${name}_work` : name
  return model ? { workroom, model } : { workroom }
}

// Claude Code が会話の記録を置くフォルダ（作業フォルダの英数字以外を - にした名前）
export function projectDir(cwd: string, home = homedir()): string {
  return join(home, ".claude", "projects", cwd.replace(/[^A-Za-z0-9]/g, "-"))
}

type Entry = { type?: string; timestamp?: string; message?: { model?: string; content?: unknown } }

function entries(jsonl: string): Entry[] {
  return jsonl.split("\n").flatMap(line => {
    if (!line.trim()) return []
    try {
      return [JSON.parse(line) as Entry]
    } catch {
      return []
    }
  })
}

export function lastModel(jsonl: string): string | undefined {
  const models = entries(jsonl).flatMap(e =>
    e.type === "assistant" && e.message?.model && e.message.model !== "<synthetic>" ? [e.message.model] : [],
  )
  return models.at(-1)
}

// since より後の、最後の assistant の文章
export function lastAssistantText(jsonl: string, since: number): string | undefined {
  const texts = entries(jsonl).flatMap(e => {
    if (e.type !== "assistant" || !e.timestamp || Date.parse(e.timestamp) <= since) return []
    const content = e.message?.content
    if (!Array.isArray(content)) return []
    const text = content
      .flatMap(c =>
        c && typeof c === "object" && (c as { type?: string }).type === "text" ? [(c as { text: string }).text] : [],
      )
      .join("\n")
    return text.trim() ? [text] : []
  })
  return texts.at(-1)
}

type Block = { type?: string; name?: string; id?: string; tool_use_id?: string; content?: unknown }

function blocks(e: Entry): Block[] {
  const content = e.message?.content
  return Array.isArray(content) ? content.filter((c): c is Block => !!c && typeof c === "object") : []
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content.map(c => (c && typeof c === "object" ? ((c as { text?: string }).text ?? "") : "")).join("")
}

// since より後に呼んだ matomezu の join が、参加者 id を返したか（申し込み中でなく、受け入れられた）
export function joinedSince(jsonl: string, since: number): boolean {
  const all = entries(jsonl)
  const calls = new Set(
    all.flatMap(e =>
      e.type === "assistant" && e.timestamp && Date.parse(e.timestamp) > since
        ? blocks(e).flatMap(b => (b.type === "tool_use" && b.id && /matomezu__join$/.test(b.name ?? "") ? [b.id] : []))
        : [],
    ),
  )
  return all.some(e =>
    blocks(e).some(
      b => b.type === "tool_result" && calls.has(b.tool_use_id ?? "") && /"participant"/.test(resultText(b.content)),
    ),
  )
}

// 会話の記録から、参加しているワークルームの名前を読む。利用者が話しかけたときのフックが足した知らせ（英語か日本語）の最後の物、
// 無ければ参加者 id を返した最後の join に渡した workroom。ツールの入力や答えに出てくる同じ文（ファイルの中身など）は読まない
const JOINED = /(?:oined matomezu\. Workroom name|matomezu に参加しました。ワークルーム名): (\S+)/

type Attachment = { type?: string; attachment?: { type?: string; content?: unknown } }

// 会話の記録で、フックが足した「参加しました」の知らせのワークルーム名（since より後の物だけ。since が無ければ全部）
function toldWorkrooms(jsonl: string, since?: number): string[] {
  return jsonl.split("\n").flatMap(line => {
    if (!line.includes("hook_additional_context")) return []
    try {
      const e = JSON.parse(line) as Attachment & { timestamp?: string }
      const a = e.attachment
      if (a?.type !== "hook_additional_context" || !Array.isArray(a.content)) return []
      if (since !== undefined && !(e.timestamp && Date.parse(e.timestamp) > since)) return []
      return a.content.flatMap(c => (typeof c === "string" ? [JOINED.exec(c)?.[1]].filter(w => w !== undefined) : []))
    } catch {
      return []
    }
  })
}

// since より後に、ターンの始まりのフックが参加を伝えたか（セッションと参加者を結んだ）
export function toldJoinedSince(jsonl: string, since: number): boolean {
  return toldWorkrooms(jsonl, since).length > 0
}

// since より後に、ターンの始まりのフックが伝えた参加のワークルーム名（最後の物）
export function toldWorkroomSince(jsonl: string, since: number): string | undefined {
  return toldWorkrooms(jsonl, since).at(-1)
}

export function workroomOf(jsonl: string): string | undefined {
  const told = toldWorkrooms(jsonl)
  if (told.length > 0) return told.at(-1)
  const all = entries(jsonl)
  const asked = new Map<string, string>()
  for (const e of all)
    for (const b of blocks(e)) {
      const workroom = (b as { input?: { workroom?: unknown } }).input?.workroom
      if (b.type === "tool_use" && b.id && /matomezu__join$/.test(b.name ?? "") && typeof workroom === "string")
        asked.set(b.id, workroom)
    }
  const joined = all.flatMap(e =>
    blocks(e).flatMap(b =>
      b.type === "tool_result" && asked.has(b.tool_use_id ?? "") && /"participant"/.test(resultText(b.content))
        ? [asked.get(b.tool_use_id ?? "") as string]
        : [],
    ),
  )
  return joined.at(-1)
}

export type Readiness = "ready" | "not-ready" | "no-answer"

export function readiness(text: string | undefined): Readiness {
  if (text === undefined) return "no-answer"
  const tail = text.trim().split("\n").at(-1) ?? ""
  if (tail.includes(NG_MARK)) return "not-ready"
  return tail.includes(READY_MARK) ? "ready" : "not-ready"
}

export function preparePrompt(workroom: string, relaunch: boolean): string {
  return [
    relaunch
      ? `再起動の準備をしてください（main_manager がまとめて再起動します。あなたは ${workroom} のまま同じ worktree で起動し直されます）。`
      : `出直しの準備をしてください（main_manager が会話を空にして出直させます。あなたは ${workroom} のまま同じ worktree で続けます）。`,
    `- 記憶フォルダの ${workroom.replace(/_work$/, "")} の引き継ぎのノートを、今の状態と次にやる事に書き直す`,
    "- 未コミットの変更を残さない。区切りでなく残すしかないときは、コミットせずに理由を書いて終える",
    `- 終わったら、最後の行に「${READY_MARK}」とだけ書く。準備できないときは最後の行に「${NG_MARK}: <理由>」と書く`,
  ].join("\n")
}

// clear で出直したあとに頼む文。参加は続いているので join させない
export function continuePrompt(workroom: string): string {
  return `${workroom.replace(/_work$/, "")} の handoff よんで（matomezu の参加は続いているので join しない）`
}

export function rejoinPrompt(workroom: string, link: string): string {
  return `${workroom.replace(/_work$/, "")} の handoff よんで join（ワークルーム ${workroom}、link は ${link} をそのまま使う）`
}

// claude-relay.sh に渡し、起動した claude がそのまま受けるはずの引数
export function launchArgs(model: string): string[] {
  return ["--model", model]
}

// --env で渡せる環境変数。端末に打ち込むので、引用の要らない文字だけにする
const ENV_PAIR = /^([A-Z_][A-Z0-9_]*)=([A-Za-z0-9_.:/@%+,-]*)$/

export function parseEnv(pair: string): [string, string] {
  const m = pair.match(ENV_PAIR)
  if (!m) throw new Error(`--env は KEY=VAL（KEY は大文字と _、VAL は引用の要らない文字）: ${pair}`)
  return [m[1] as string, m[2] as string]
}

// 端末に打ち込む起動の文
export function launchCommand(args: string[], env: [string, string][], relay = true): string {
  return [...env.map(([k, v]) => `${k}=${v}`), relay ? "scripts/claude-relay.sh" : "claude", ...args].join(" ")
}

// 起動した claude の /proc/<pid>/environ が、中継を通したか（claude-relay.sh は ANTHROPIC_BASE_URL を中継に向ける）
export function launchedThroughRelay(environ: string): boolean {
  return environ.split("\0").some(e => e.startsWith("ANTHROPIC_BASE_URL="))
}

// 起動した claude の /proc/<pid>/environ に、env がどれもそのとおりにあるか
export function launchedEnv(environ: string, env: [string, string][]): boolean {
  const got = new Set(environ.split("\0"))
  return env.every(([k, v]) => got.has(`${k}=${v}`))
}

// /proc/<pid>/cmdline の中身を、引数の並びにする
function argvOf(cmdline: string): string[] {
  const argv = cmdline.split("\0")
  return argv.at(-1) === "" ? argv.slice(0, -1) : argv
}

// 起動した claude の cmdline が、プログラムの名前のあとに引数 args だけを受けたか
export function launchedWith(cmdline: string, args: string[]): boolean {
  const got = argvOf(cmdline).slice(1)
  return got.length === args.length && got.every((a, i) => a === args[i])
}

// 開発の常駐の保管庫フォルダ（MATOMEZU_HOME か、作業フォルダ cwd のリポジトリの git の共通のフォルダの隣の .dev-home）
function devHome(cwd: string): string {
  if (process.env.MATOMEZU_HOME) return process.env.MATOMEZU_HOME
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8" }).trim()
  return join(dirname(resolve(cwd, common)), ".dev-home")
}

// 開発の常駐に、ワークルーム workroom の続きを合言葉 link で頼んだ join を前もって承認させる
async function passRejoin(cwd: string, workroom: string, link: string): Promise<void> {
  const server = JSON.parse(readFileSync(join(devHome(cwd), "server.json"), "utf8")) as { url: string; token: string }
  const res = await fetch(`${server.url}/api/dev/rejoin-pass`, {
    method: "POST",
    headers: { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workroom, link }),
  })
  if (!res.ok) throw new Error(`再参加の承認が断られた: ${res.status} ${await res.text()}`)
}

const ORCA = process.env.ORCA_CLI_COMMAND || "orca-ide"

async function orca(args: string[], timeoutMs = 60_000): Promise<unknown> {
  const { stdout: out } = await promisify(execFile)(ORCA, [...args, "--json"], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  })
  const parsed = JSON.parse(out) as { ok?: boolean; result?: unknown; error?: unknown }
  if (parsed.ok === false) throw new Error(`orca ${args.join(" ")}: ${JSON.stringify(parsed.error)}`)
  return parsed.result
}

type Sub = { pid: number; handle: string; cwd: string }

// claude のプロセスの環境変数から、それが動いている Orca の端末（Orca が端末ごとに渡す ORCA_TERMINAL_HANDLE）
function terminalOf(pid: number): string | undefined {
  try {
    const env = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0")
    return env.find(e => e.startsWith("ORCA_TERMINAL_HANDLE="))?.slice("ORCA_TERMINAL_HANDLE=".length) || undefined
  } catch {
    return undefined
  }
}

// claude のプロセスの会話の記録。Claude Code が ~/.claude/sessions/<pid>.json に書く sessionId から決める
// （公式の口ではないので、ここだけで読む。無ければ作業フォルダの最新の記録）
function transcriptOf(pid: number, cwd: string): string | undefined {
  try {
    const { sessionId } = JSON.parse(readFileSync(join(homedir(), ".claude", "sessions", `${pid}.json`), "utf8")) as {
      sessionId?: string
    }
    const file = sessionId ? join(projectDir(cwd), `${sessionId}.jsonl`) : undefined
    if (file && existsSync(file)) return file
  } catch {}
  return latestTranscript(cwd)
}

function allClaudePids(): number[] {
  return readdirSync("/proc").flatMap(d => {
    if (!/^\d+$/.test(d)) return []
    try {
      return readFileSync(`/proc/${d}/comm`, "utf8").trim() === "claude" ? [Number(d)] : []
    } catch {
      return []
    }
  })
}

// ワークルーム workroom に参加している、Orca の端末で動く claude
function findSub(workroom: string): Sub {
  const found = allClaudePids().flatMap(pid => {
    const handle = terminalOf(pid)
    if (!handle) return []
    try {
      const cwd = readlinkSync(`/proc/${pid}/cwd`)
      const transcript = transcriptOf(pid, cwd)
      return transcript && workroomOf(readFileSync(transcript, "utf8")) === workroom ? [{ pid, handle, cwd }] : []
    } catch {
      return []
    }
  })
  const [only, ...rest] = found
  if (!only || rest.length > 0) throw new Error(`${workroom} に参加している Orca の端末の claude が ${found.length} 個`)
  return only
}

function claudePids(cwd: string): number[] {
  return allClaudePids().filter(pid => {
    try {
      return readlinkSync(`/proc/${pid}/cwd`) === cwd
    } catch {
      return false
    }
  })
}

function latestTranscript(cwd: string): string | undefined {
  const dir = projectDir(cwd)
  try {
    const files = readdirSync(dir).filter(f => f.endsWith(".jsonl"))
    return files.map(f => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  } catch {
    return undefined
  }
}

function queued(cwd: string): boolean {
  return queuedRequests(commonDir(cwd)).some(r => r.worktree === cwd)
}

// 取り込みのキューのロック（merge-queue.ts と同じ）を取る。返す関数で外す
async function holdQueueLock(cwd: string): Promise<() => void> {
  const child = spawn("flock", [queueLock(commonDir(cwd)), "sh", "-c", "echo locked; cat >/dev/null"], {
    stdio: ["pipe", "pipe", "inherit"],
  })
  await new Promise<void>((res, rej) => {
    child.stdout.once("data", () => res())
    child.once("exit", code => rej(new Error(`キューのロックを取れなかった（${code}）`)))
  })
  return () => child.stdin.end()
}

function trackedChanges(cwd: string): string {
  return execFileSync("git", ["-C", cwd, "status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim()
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function until(what: string, timeoutMs: number, ok: () => boolean): Promise<void> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (ok()) return
    await sleep(1000)
  }
  throw new Error(`${what} を待ち切れなかった`)
}

async function send(handle: string, text: string): Promise<void> {
  await orca(["terminal", "send", "--terminal", handle, "--text", text, "--enter"])
}

// 端末の最近の出力（止めたときに、何が打ち込まれたかを残す）
async function terminalTail(handle: string): Promise<string> {
  try {
    const out = (await orca(["terminal", "read", "--terminal", handle, "--limit", "40"])) as {
      terminal?: { tail?: string[] }
    }
    return out.terminal?.tail?.join("\n") ?? ""
  } catch (e) {
    return `（端末を読めない: ${(e as Error).message}）`
  }
}

async function waitIdle(handle: string, timeoutMs: number): Promise<void> {
  await orca(
    ["terminal", "wait", "--terminal", handle, "--for", "tui-idle", "--timeout-ms", String(timeoutMs)],
    timeoutMs + 30_000,
  )
}

// キューが入れたあとに作り直したプラグインのキャッシュと MCP の常駐を、今の claude に読み直させる
async function reloadPlugins(handle: string, log: (s: string) => void): Promise<void> {
  for (const cmd of ["/reload-plugins", `/mcp reconnect ${MCP_SERVER}`]) {
    await send(handle, cmd)
    await sleep(3000)
    await waitIdle(handle, 120_000)
    log(`${cmd} を送った`)
  }
}

type Options = { dryRun: boolean; timeoutMs: number; env: [string, string][]; relay: boolean; relaunch: boolean }

// 起動し直す型にするか: --relaunch か、プロセスの中身を替える物（--env・--no-relay・モデルの指定）があるとき。ほかは clear で出直す
export function needsRelaunch(target: Target, o: Pick<Options, "env" | "relay" | "relaunch">): boolean {
  return o.relaunch || o.env.length > 0 || !o.relay || target.model !== undefined
}

async function restart(target: Target, opts: Options): Promise<void> {
  const log = (s: string) => console.log(`[${target.workroom}] ${s}`)
  const sub = findSub(target.workroom)
  const term = { handle: sub.handle }
  const cwd = sub.cwd
  const transcript = transcriptOf(sub.pid, cwd)
  const model = target.model ?? (transcript ? lastModel(readFileSync(transcript, "utf8")) : undefined)
  if (!model) throw new Error("モデルが分からない（sub:モデル で指定する）")
  const pids = claudePids(cwd)
  log(
    `端末 ${term.handle}、${cwd}、モデル ${model}、claude ${pids.join(",") || "なし"}、${opts.relaunch ? "起動し直す" : "clear で出直す"}`,
  )
  if (pids.length !== 1) throw new Error(`この worktree の claude が ${pids.length} 個`)
  if (queued(cwd)) throw new Error("取り込みのキューに並んでいる")
  if (opts.dryRun) return

  const askedAt = Date.now()
  await send(term.handle, preparePrompt(target.workroom, opts.relaunch))
  log(opts.relaunch ? "再起動の準備を頼んだ" : "出直しの準備を頼んだ")
  // 手が空いたかでは判じない（作業の途中で空いたと返ることがある）。返事の最後の行に印が出るまで待つ
  const answer = () => {
    const now = latestTranscript(cwd)
    const text = now ? lastAssistantText(readFileSync(now, "utf8"), askedAt) : undefined
    return text
      ?.trim()
      .split("\n")
      .at(-1)
      ?.match(new RegExp(`${READY_MARK}|${NG_MARK}`))
      ? text
      : undefined
  }
  await until("準備の返事", opts.timeoutMs, () => answer() !== undefined)
  const state = readiness(answer())
  if (state !== "ready") throw new Error(`準備ができていない（${state}）。端末を見る`)
  await waitIdle(term.handle, 120_000)
  const changes = trackedChanges(cwd)
  if (changes) throw new Error(`未コミットの変更が残っている:\n${changes}`)

  if (opts.relaunch) return relaunchAndRejoin(term.handle, cwd, model, target.workroom, opts, log)
  return clearAndContinue(term.handle, cwd, target.workroom, log)
}

// 起動し直す型: /exit して claude を起動し直し、合言葉で join し直させる（プロセスの中身を替えるとき）
async function relaunchAndRejoin(
  handle: string,
  cwd: string,
  model: string,
  workroom: string,
  opts: Options,
  log: (s: string) => void,
): Promise<void> {
  log("取り込みのキューのロックを待つ")
  const release = await holdQueueLock(cwd)
  try {
    if (queued(cwd)) throw new Error("取り込みのキューに並んでいる")
    await send(handle, "/exit")
    await until("claude の終わり", 60_000, () => claudePids(cwd).length === 0)
    log("終えた")

    // 終えた claude への端末の答えが、打ち込む文の途中に混ざらないよう、届き終わるまで待つ。
    // Ctrl+U は、文より前に残った文字だけを消す。文の後ろに混ざった物は、起動の引数を確かめて止める
    await sleep(3000)
    await orca(["terminal", "send", "--terminal", handle, "--text", "\x15"])
    const args = launchArgs(model)
    await send(handle, launchCommand(args, opts.env, opts.relay))
    await until("claude の起動", 120_000, () => claudePids(cwd).length === 1)
    const [launched] = claudePids(cwd)
    const cmdline = readFileSync(`/proc/${launched}/cmdline`, "utf8")
    if (!launchedWith(cmdline, args)) {
      throw new Error(
        `起動した claude の引数が違う: ${JSON.stringify(argvOf(cmdline))}。端末を見る\n${await terminalTail(handle)}`,
      )
    }
    const environ = readFileSync(`/proc/${launched}/environ`, "utf8")
    if (!launchedEnv(environ, opts.env))
      throw new Error(`起動した claude に環境変数が渡っていない: ${launchCommand([], opts.env)}`)
    if (!opts.relay && launchedThroughRelay(environ))
      throw new Error("--no-relay なのに起動した claude に ANTHROPIC_BASE_URL がある")
    log(opts.env.length > 0 ? "claude の起動の引数と環境変数を確かめた" : "claude の起動の引数を確かめた")
    await sleep(5000)
    await waitIdle(handle, 120_000)
    await reloadPlugins(handle, log)
  } finally {
    release()
  }
  const link = randomUUID()
  await passRejoin(cwd, workroom, link)
  const joinAskedAt = Date.now()
  await send(handle, rejoinPrompt(workroom, link))
  log("引き継ぎを読んで join するよう頼んだ（前もって承認した合言葉で）")
  await until("join の参加者 id", 600_000, () => {
    const now = latestTranscript(cwd)
    return now ? joinedSince(readFileSync(now, "utf8"), joinAskedAt) : false
  })
  await waitIdle(handle, opts.timeoutMs)
  const bound = () => {
    const now = latestTranscript(cwd)
    return now ? toldJoinedSince(readFileSync(now, "utf8"), joinAskedAt) : false
  }
  try {
    await until("フックが参加を伝える", BOUND_WAIT_MS, bound)
    log("参加した（受け入れの知らせで始まったターンのフックが、セッションと結んだ）")
  } catch {
    await send(handle, CONFIRM_PROMPT)
    log("参加した。フックが参加を伝えなかったので、セッションと結ぶため、もう一言送った")
  }
}

// clear で出直す型: /clear で会話を空にし、引き継ぎを読むよう頼む。参加者は M-0238 の仕組みで新しい会話に移るので join し直さない。
// 移ったことは、頼んだターンのフックが伝える「参加しました」のワークルーム名で確かめる
async function clearAndContinue(
  handle: string,
  cwd: string,
  workroom: string,
  log: (s: string) => void,
): Promise<void> {
  log("取り込みのキューのロックを待つ")
  const release = await holdQueueLock(cwd)
  try {
    if (queued(cwd)) throw new Error("取り込みのキューに並んでいる")
    await send(handle, "/clear")
    await sleep(3000)
    await waitIdle(handle, 120_000)
    log("/clear を送った")
    await reloadPlugins(handle, log)
  } finally {
    release()
  }
  const askedAt = Date.now()
  await send(handle, continuePrompt(workroom))
  log("引き継ぎを読むよう頼んだ")
  const told = () => {
    const now = latestTranscript(cwd)
    return now ? toldWorkroomSince(readFileSync(now, "utf8"), askedAt) : undefined
  }
  await until("フックが参加を伝える", BOUND_WAIT_MS, () => told() !== undefined)
  if (told() !== workroom) throw new Error(`clear のあと、${workroom} でなく ${told()} に参加している。端末を見る`)
  log("参加したまま出直した（clear の前の参加者が新しい会話に移った）")
}

// サブごとの結果の 1 行。done は済んだサブに付ける言葉。止めたサブは理由のはじめの行だけ（全部は止めたときに出している）
export function resultLine(workrooms: string[], results: PromiseSettledResult<unknown>[], done: string): string {
  const each = workrooms.map((w, i) => {
    const r = results[i]
    if (r?.status !== "rejected") return `${w} ${done}`
    const why = r.reason instanceof Error ? r.reason.message : String(r.reason)
    return `${w} 止めた: ${why.split("\n")[0]}`
  })
  return `結果: ${each.join(" / ")}`
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const ti = args.indexOf("--timeout-min")
  const timeoutMs = (ti >= 0 ? Number(args[ti + 1]) : 30) * 60_000
  const env = args.flatMap((a, i) => (args[i - 1] === "--env" ? [parseEnv(a)] : []))
  const targets = args
    .filter((a, i) => !a.startsWith("--") && !(ti >= 0 && i === ti + 1) && args[i - 1] !== "--env")
    .map(parseTarget)
  if (targets.length === 0) {
    console.error(
      "使い方: bun scripts/restart-subs.ts [--dry-run] [--timeout-min <分>] [--relaunch] [--env <KEY=VAL>]... [--no-relay] <サブ>...",
    )
    process.exit(2)
  }
  const base = { dryRun, timeoutMs, env, relay: !args.includes("--no-relay"), relaunch: args.includes("--relaunch") }
  const results = await Promise.allSettled(targets.map(t => restart(t, { ...base, relaunch: needsRelaunch(t, base) })))
  let failed = 0
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      failed++
      console.error(`[${targets[i]?.workroom}] 止めた: ${(r.reason as Error).message}`)
    }
  })
  console.log(
    resultLine(
      targets.map(t => t.workroom),
      results,
      dryRun ? "確かめた" : "参加した",
    ),
  )
  process.exit(failed ? 1 : 0)
}
