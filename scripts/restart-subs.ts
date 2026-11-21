// Orca の端末で動くサブの Claude Code を、まとめて再起動する
//   bun scripts/restart-subs.ts [--dry-run] [--timeout-min <分>] <サブ>...
//   <サブ> は sub4（sub4_work の略）・sub4_work・main_manager などのワークルーム名、モデルを指定するなら sub6:claude-fable-5-2（無ければ最後の会話のモデル）
// サブごとに並行して、次の順に進める。どこかで止まったサブは、そこで止めて理由を出す
//   1. 再起動の準備（引き継ぎを書き、未コミットを残さない）を頼み、手が空くのを待つ
//   2. 最後の返事が READY_MARK で終わり、追跡するファイルに変更が無ければ /exit を送り、claude が終わるのを待つ
//   3. scripts/claude-relay.sh --model <モデル> を送り、/reload-plugins と /mcp reconnect を送り、引き継ぎを読んで join するよう頼む。
//      join の合言葉（link）はここで作り、開発の常駐に前もって承認させておく（画面で受け入れずに入る。開発用の口 /api/dev/rejoin-pass）
//   4. join が参加者 id を返したら、手が空くのを待って、もう一言送る。セッションと参加者を結ぶのは利用者が話しかけたときのフックなので、
//      join の頼みが最後の発話のままだと結ばれず、画面で準備中のまま残る
// サブは Orca にエージェントとして見えない（claude-relay.sh で起動するため）ので、Orca の端末に打ち込んで進める
import { execFile, execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync, readlinkSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"

export const READY_MARK = "再起動の準備OK"
export const NG_MARK = "再起動の準備NG"
export const MCP_SERVER = "plugin:matomezu:matomezu"

export const CONFIRM_PROMPT = "参加の確かめです。返事は短く"

export type Target = { workroom: string; model?: string }

export function parseTarget(arg: string): Target {
  const [name, model] = arg.split(":", 2) as [string, string | undefined]
  // subN だけは subN_work の略として読む（main_manager などはそのまま）
  const workroom = /^sub\d+$/.test(name) ? `${name}_work` : name
  return model ? { workroom, model } : { workroom }
}

// Orca が返す \\wsl.localhost\<ディストリ>\home\... を WSL のパスに直す
export function wslPath(orcaPath: string): string {
  const m = /^\\\\wsl(?:\.localhost|\$)\\[^\\]+(\\.*)$/.exec(orcaPath)
  return m?.[1] ? m[1].replaceAll("\\", "/") : orcaPath
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

export type Readiness = "ready" | "not-ready" | "no-answer"

export function readiness(text: string | undefined): Readiness {
  if (text === undefined) return "no-answer"
  const tail = text.trim().split("\n").at(-1) ?? ""
  if (tail.includes(NG_MARK)) return "not-ready"
  return tail.includes(READY_MARK) ? "ready" : "not-ready"
}

export function preparePrompt(workroom: string): string {
  return [
    `再起動の準備をしてください（main_manager がまとめて再起動します。あなたは ${workroom} のまま同じ worktree で起動し直されます）。`,
    `- 記憶フォルダの ${workroom.replace(/_work$/, "")} の引き継ぎのノートを、今の状態と次にやる事に書き直す`,
    "- 未コミットの変更を残さない。区切りでなく残すしかないときは、コミットせずに理由を書いて終える",
    `- 終わったら、最後の行に「${READY_MARK}」とだけ書く。準備できないときは最後の行に「${NG_MARK}: <理由>」と書く`,
  ].join("\n")
}

export function rejoinPrompt(workroom: string, link: string): string {
  return `${workroom.replace(/_work$/, "")} の handoff よんで join（ワークルーム ${workroom}、link は ${link} をそのまま使う）`
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

type Terminal = { handle: string; title: string; worktreePath: string }
type Layout = { root?: unknown }

function tabTitles(node: unknown, out: Map<string, string>): void {
  if (!node || typeof node !== "object") return
  const n = node as {
    tabs?: { title?: string; panes?: unknown }[]
    children?: unknown[]
    handle?: string
    type?: string
  }
  for (const tab of n.tabs ?? []) collectHandles(tab.panes, tab.title ?? "", out)
  for (const c of n.children ?? []) tabTitles(c, out)
}

function collectHandles(node: unknown, title: string, out: Map<string, string>): void {
  if (!node || typeof node !== "object") return
  const n = node as { type?: string; handle?: string; children?: unknown[] }
  if (n.type === "terminal" && n.handle) out.set(n.handle, title)
  for (const c of n.children ?? []) collectHandles(c, title, out)
}

async function findTerminal(workroom: string): Promise<Terminal> {
  const r = (await orca(["terminal", "list", "--include-visual-layouts"])) as {
    terminals: Terminal[]
    visualLayouts?: Layout[]
  }
  const tabOf = new Map<string, string>()
  for (const l of r.visualLayouts ?? []) tabTitles(l.root, tabOf)
  const byTab = r.terminals.filter(t => tabOf.get(t.handle) === workroom)
  const found = byTab.length > 0 ? byTab : r.terminals.filter(t => t.title === workroom)
  const [only, ...rest] = found
  if (!only || rest.length > 0) throw new Error(`タブ ${workroom} の端末が ${found.length} 個`)
  return only
}

function claudePids(cwd: string): number[] {
  return readdirSync("/proc").flatMap(d => {
    if (!/^\d+$/.test(d)) return []
    try {
      if (readFileSync(`/proc/${d}/comm`, "utf8").trim() !== "claude") return []
      return readlinkSync(`/proc/${d}/cwd`) === cwd ? [Number(d)] : []
    } catch {
      return []
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

async function waitIdle(handle: string, timeoutMs: number): Promise<void> {
  await orca(
    ["terminal", "wait", "--terminal", handle, "--for", "tui-idle", "--timeout-ms", String(timeoutMs)],
    timeoutMs + 30_000,
  )
}

async function restart(target: Target, opts: { dryRun: boolean; timeoutMs: number }): Promise<void> {
  const log = (s: string) => console.log(`[${target.workroom}] ${s}`)
  const term = await findTerminal(target.workroom)
  const cwd = wslPath(term.worktreePath)
  const transcript = latestTranscript(cwd)
  const model = target.model ?? (transcript ? lastModel(readFileSync(transcript, "utf8")) : undefined)
  if (!model) throw new Error("モデルが分からない（sub:モデル で指定する）")
  const pids = claudePids(cwd)
  log(`端末 ${term.handle}、${cwd}、モデル ${model}、claude ${pids.join(",") || "なし"}`)
  if (pids.length !== 1) throw new Error(`この worktree の claude が ${pids.length} 個`)
  if (opts.dryRun) return

  const askedAt = Date.now()
  await send(term.handle, preparePrompt(target.workroom))
  log("再起動の準備を頼んだ")
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

  await send(term.handle, "/exit")
  await until("claude の終わり", 60_000, () => claudePids(cwd).length === 0)
  log("終えた")

  await send(term.handle, `scripts/claude-relay.sh --model ${model}`)
  await until("claude の起動", 120_000, () => claudePids(cwd).length === 1)
  await sleep(5000)
  await waitIdle(term.handle, 120_000)
  for (const cmd of ["/reload-plugins", `/mcp reconnect ${MCP_SERVER}`]) {
    await send(term.handle, cmd)
    await sleep(3000)
    await waitIdle(term.handle, 120_000)
    log(`${cmd} を送った`)
  }
  const link = randomUUID()
  await passRejoin(cwd, target.workroom, link)
  const joinAskedAt = Date.now()
  await send(term.handle, rejoinPrompt(target.workroom, link))
  log("引き継ぎを読んで join するよう頼んだ（前もって承認した合言葉で）")
  await until("join の参加者 id", 600_000, () => {
    const now = latestTranscript(cwd)
    return now ? joinedSince(readFileSync(now, "utf8"), joinAskedAt) : false
  })
  await waitIdle(term.handle, opts.timeoutMs)
  await send(term.handle, CONFIRM_PROMPT)
  log("参加した。セッションと結ぶため、もう一言送った")
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const ti = args.indexOf("--timeout-min")
  const timeoutMs = (ti >= 0 ? Number(args[ti + 1]) : 30) * 60_000
  const targets = args.filter((a, i) => !a.startsWith("--") && !(ti >= 0 && i === ti + 1)).map(parseTarget)
  if (targets.length === 0) {
    console.error("使い方: bun scripts/restart-subs.ts [--dry-run] [--timeout-min <分>] <サブ>...")
    process.exit(2)
  }
  const results = await Promise.allSettled(targets.map(t => restart(t, { dryRun, timeoutMs })))
  let failed = 0
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      failed++
      console.error(`[${targets[i]?.workroom}] 止めた: ${(r.reason as Error).message}`)
    }
  })
  process.exit(failed ? 1 : 0)
}
