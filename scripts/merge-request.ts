// 平行作業の worktree のブランチを、main への取り込みのキューに並べ、結果を待って返す。サブは Claude Code のバックグラウンドで流す
//   bun scripts/merge-request.ts
// 進め方
//   1. この worktree のブランチの先（頼んだ時の sha）を決め、並べられるかを確かめる（refusal）
//   2. 並んでいる印（requestsDir の下の <pid>.json）を置く。restart-subs は印のある worktree のサブを起動し直さない
//   3. main の worktree の scripts/merge-queue.ts を --push で流す。このスクリプトとは切り離すので、待つ間にこれが止められても、
//      キューは終わりまで流れ、履歴（merge-queue.ts の HISTORY）に残る。キューのロックで 1 本ずつ並ぶ
//   4. キューの結果を出し、外されたら次にする事を添える。印を消す
// 入れば 0、外されれば 1、並べなければ 2 で終わる
import { execFileSync, spawn } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { commonDir, git, type Outcome, queueDir, type Report } from "./merge-queue"

// 並んでいる印。pid はこのスクリプトのプロセス
export type Request = { branch: string; sha: string; worktree: string; pid: number; at: string }

export const requestsDir = (common: string) => join(queueDir(common), "requests")

// pid が使い回されたほかのプロセスを、並んでいると見ない
const alive = (pid: number) => {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").includes("merge-request.ts")
  } catch {
    return false
  }
}

// 並んでいる印のファイル（<pid>.json）。同じ置き場の結果とログは印でない
const MARK = /^\d+\.json$/

// 並んでいる頼み。プロセスの無い印は消す
export function queuedRequests(common: string, isAlive = alive): Request[] {
  const dir = requestsDir(common)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => MARK.test(f))
    .flatMap(f => {
      const path = join(dir, f)
      try {
        const r = JSON.parse(readFileSync(path, "utf8")) as Request
        if (isAlive(r.pid)) return [r]
      } catch {}
      rmSync(path, { force: true })
      return []
    })
}

export type Situation = {
  branch: string | undefined
  changes: string
  hasMain: boolean
  inMain: boolean
  sha: string
  queued: Request[]
}

// 並べない理由。並べるなら undefined
export function refusal(s: Situation): string | undefined {
  if (!s.branch) return "ブランチを checkout していない"
  if (s.branch === "main") return "main 自身は並べない"
  if (s.changes) return `未コミットの変更がある:\n${s.changes}`
  if (s.inMain) return "この sha は main に入っている"
  if (!s.hasMain) return "main の最新を取り込んでいない"
  const same = s.queued.find(r => r.sha === s.sha)
  if (same) return `同じ sha が並んでいる（${same.worktree}）`
  return undefined
}

// 外された物に添える次の事
export function nextStep(o: Outcome): string | undefined {
  if (o.kind === "failed")
    return `次: main ${o.base.slice(0, 8)} を取り込み、落ちたテストを流して原因を調べ、直して並び直す（流し直しで通った物も、揺れの原因を直す）。組み合わせで迷えば、相手のブランチのサブか main_manager に相談する`
  if (o.kind === "conflict") return "次: main を取り込んで衝突を解き、並び直す"
  if (o.kind === "main-side") return "次: main の側の都合なので、main_manager に知らせる"
  return undefined
}

function mainWorktree(dir: string): string | undefined {
  const blocks = git(dir, "worktree", "list", "--porcelain").split("\n\n")
  const main = blocks.find(b => b.split("\n").includes("branch refs/heads/main"))
  return main?.split("\n")[0]?.replace(/^worktree /, "")
}

const ok = (dir: string, ...args: string[]) => {
  try {
    git(dir, ...args)
    return true
  } catch {
    return false
  }
}

async function request(): Promise<number> {
  const dir = git(process.cwd(), "rev-parse", "--show-toplevel")
  const common = commonDir(dir)
  const main = mainWorktree(dir)
  if (!main) {
    console.error("main を checkout している worktree が無い")
    return 2
  }
  const sha = git(dir, "rev-parse", "HEAD")
  const branch = ok(dir, "symbolic-ref", "-q", "HEAD") ? git(dir, "symbolic-ref", "--short", "HEAD") : undefined
  const why = refusal({
    branch,
    // git() は前後の空白を落とし、はじめの行の印の列がずれるので、末尾だけ落とす
    changes: execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
      cwd: dir,
      encoding: "utf8",
    }).trimEnd(),
    hasMain: ok(dir, "merge-base", "--is-ancestor", "refs/heads/main", sha),
    inMain: ok(dir, "merge-base", "--is-ancestor", sha, "refs/heads/main"),
    sha,
    queued: queuedRequests(common),
  })
  if (why || !branch) {
    console.error(`並べない: ${why}`)
    return 2
  }

  mkdirSync(requestsDir(common), { recursive: true })
  const mark = join(requestsDir(common), `${process.pid}.json`)
  const result = join(requestsDir(common), `${process.pid}.result`)
  const out = join(requestsDir(common), `${process.pid}.log`)
  const me: Request = { branch, sha, worktree: dir, pid: process.pid, at: new Date().toISOString() }
  writeFileSync(mark, JSON.stringify(me))
  try {
    console.log(`並んだ: ${branch} ${sha.slice(0, 8)}`)
    const fd = openSync(out, "w")
    const code = await new Promise<number>(res => {
      const child = spawn(
        process.execPath,
        [join(main, "scripts", "merge-queue.ts"), "--main", main, "--push", "--result", result, `${branch}:${sha}`],
        { cwd: main, detached: true, stdio: ["ignore", fd, fd] },
      )
      child.on("close", c => res(c ?? 1))
    })
    closeSync(fd)
    console.log(readFileSync(out, "utf8").trimEnd())
    if (!existsSync(result)) {
      console.log(`キューが結果を書かずに終わった（終了コード ${code}。ログ ${out}）。main_manager に知らせる`)
      return 1
    }
    const report = JSON.parse(readFileSync(result, "utf8")) as Report
    for (const o of report.outcomes) {
      const next = nextStep(o)
      if (next) console.log(next)
    }
    if (report.pushed && !report.pushed.ok)
      console.log("次: main に入ったが push に失敗したので、main_manager に知らせる")
    rmSync(out, { force: true })
    return code === 0 ? 0 : 1
  } finally {
    rmSync(mark, { force: true })
    rmSync(result, { force: true })
  }
}

if (import.meta.main) process.exit(await request())
