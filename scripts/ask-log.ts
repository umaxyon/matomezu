// ユーザーへの質問（AskUserQuestion）と答えを 1 問 1 行で残し、推しがそのまま通ったかを数える
//   bun scripts/ask-log.ts hook      Claude Code の PostToolUse フック（matcher AskUserQuestion）。標準入力のフックの入力から 1 問ずつ足す
//   bun scripts/ask-log.ts backfill  ~/.claude/projects の matomezu の会話の記録から、まだ無い問いを足す（会話の記録は古い物から消える）
//   bun scripts/ask-log.ts stats     月ごと・結果ごとの数を出す
// 置き場は、main のチェックアウトの .claude/settings.local.json の autoMemoryDirectory の下の ask-log/<マシン名>.jsonl。
//   マシンごとにファイルを分け、記憶フォルダの同期でぶつからないようにする。autoMemoryDirectory が無ければ main のチェックアウトの tmp/
// フックは失敗しても何も出さずに終える（質問の流れを止めない）
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { homedir, hostname } from "node:os"
import { dirname, join } from "node:path"

const RECOMMENDED = "(Recommended)"

export type Outcome = "recommended" | "other-option" | "free-text" | "no-recommendation"

export type AskRecord = {
  id: string
  at: string
  worktree: string
  header: string
  question: string
  recommended: string | undefined
  answer: string
  outcome: Outcome
  notes: string | undefined
}

type Option = { label: string }
type Question = { question: string; header?: string; options?: readonly Option[]; multiSelect?: boolean }
type Result = {
  questions?: Question[]
  answers?: Record<string, string>
  annotations?: Record<string, { notes?: string }>
}

export function outcomeOf(q: Question, answer: string): Outcome {
  const labels = (q.options ?? []).map(o => o.label)
  const recommended = labels.find(l => l.includes(RECOMMENDED))
  if (recommended === undefined) return "no-recommendation"
  if (answer === recommended) return "recommended"
  const picks = q.multiSelect ? answer.split(", ") : [answer]
  return picks.every(p => labels.includes(p)) ? "other-option" : "free-text"
}

// 1 回の AskUserQuestion の結果から、答えのある問いごとに 1 行を作る
export function recordsOf(result: Result, toolUseId: string, at: string, cwd: string): AskRecord[] {
  const out: AskRecord[] = []
  for (const [i, q] of (result.questions ?? []).entries()) {
    const answer = result.answers?.[q.question]
    if (answer === undefined) continue
    out.push({
      id: `${toolUseId}#${i}`,
      at,
      worktree: cwd.split("/").pop() ?? cwd,
      header: q.header ?? "",
      question: q.question,
      recommended: (q.options ?? []).map(o => o.label).find(l => l.includes(RECOMMENDED)),
      answer,
      outcome: outcomeOf(q, answer),
      notes: result.annotations?.[q.question]?.notes,
    })
  }
  return out
}

function logPath(cwd: string): string {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
  }).trim()
  const main = dirname(common)
  let dir = join(main, "tmp")
  try {
    const memory = JSON.parse(readFileSync(join(main, ".claude", "settings.local.json"), "utf8")).autoMemoryDirectory
    if (typeof memory === "string" && existsSync(memory)) dir = memory
  } catch {}
  return join(dir, "ask-log", `${hostname()}.jsonl`)
}

function readIds(path: string): Set<string> {
  if (!existsSync(path)) return new Set()
  return new Set(
    readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map(l => (JSON.parse(l) as AskRecord).id),
  )
}

function append(path: string, records: AskRecord[]): number {
  const ids = readIds(path)
  const fresh = records.filter(r => !ids.has(r.id))
  if (fresh.length === 0) return 0
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, fresh.map(r => `${JSON.stringify(r)}\n`).join(""))
  return fresh.length
}

function hook(input: string): void {
  const p = JSON.parse(input) as { tool_name?: string; tool_use_id?: string; tool_response?: unknown; cwd?: string }
  if (p.tool_name !== "AskUserQuestion" || typeof p.cwd !== "string" || typeof p.tool_response !== "object") return
  const records = recordsOf(
    p.tool_response as Result,
    p.tool_use_id ?? `hook-${Date.now()}`,
    new Date().toISOString(),
    p.cwd,
  )
  append(logPath(p.cwd), records)
}

// 会話の記録の 1 行から、AskUserQuestion の結果の行を作る
export function recordsOfTranscriptLine(line: string): AskRecord[] {
  if (!line.includes('"answers"')) return []
  let o: { toolUseResult?: unknown; timestamp?: string; cwd?: string; message?: { content?: unknown } }
  try {
    o = JSON.parse(line)
  } catch {
    return []
  }
  const r = o.toolUseResult as Result | undefined
  if (typeof r !== "object" || r === null || !r.answers || !r.questions) return []
  const content = Array.isArray(o.message?.content) ? (o.message.content as { tool_use_id?: string }[]) : []
  const id = content.find(c => typeof c.tool_use_id === "string")?.tool_use_id
  if (id === undefined) return []
  return recordsOf(r, id, o.timestamp ?? "", o.cwd ?? "")
}

function transcripts(): string[] {
  const base = join(homedir(), ".claude", "projects")
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith(".jsonl")) out.push(p)
    }
  }
  for (const e of readdirSync(base, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.includes("matomezu")) walk(join(base, e.name))
  }
  return out
}

function backfill(cwd: string): void {
  const records = transcripts().flatMap(p => readFileSync(p, "utf8").split("\n").flatMap(recordsOfTranscriptLine))
  const path = logPath(cwd)
  console.log(`${path} に ${append(path, records)} 問を足した`)
}

function stats(cwd: string): void {
  const path = logPath(cwd)
  const dir = dirname(path)
  const records = readdirSync(dir)
    .filter(f => f.endsWith(".jsonl"))
    .flatMap(f =>
      readFileSync(join(dir, f), "utf8")
        .split("\n")
        .filter(Boolean)
        .map(l => JSON.parse(l) as AskRecord),
    )
  const outcomes: Outcome[] = ["recommended", "other-option", "free-text", "no-recommendation"]
  const months = [...new Set(records.map(r => r.at.slice(0, 7)))].sort()
  console.log(["month", ...outcomes, "rate"].join("\t"))
  for (const m of [...months, "all"]) {
    const rs = records.filter(r => m === "all" || r.at.startsWith(m))
    const n = outcomes.map(o => rs.filter(r => r.outcome === o).length)
    const withRec = (n[0] ?? 0) + (n[1] ?? 0) + (n[2] ?? 0)
    console.log([m, ...n, withRec === 0 ? "-" : `${Math.round(((n[0] ?? 0) / withRec) * 100)}%`].join("\t"))
  }
}

if (import.meta.main) {
  const mode = process.argv[2]
  const cwd = process.cwd()
  if (mode === "hook") {
    try {
      hook(await Bun.stdin.text())
    } catch {}
  } else if (mode === "backfill") backfill(cwd)
  else if (mode === "stats") stats(cwd)
  else {
    console.error("bun scripts/ask-log.ts hook|backfill|stats")
    process.exit(2)
  }
}
