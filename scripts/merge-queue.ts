// 平行作業のブランチを main へ取り込むキュー。取り込み専用の worktree でブランチに main を取り込み、全部のテストを 1 か所で流し、
// 通れば main を fast-forward して、差分に応じて開発の常駐を作り直す
//   bun scripts/merge-queue.ts [--main <dir>] [--queue <dir>] [--addr <host:port>] [--no-rebuild] <ブランチ>...
//   --main: main を checkout している worktree（既定はこのスクリプトのあるリポジトリ）
//   --queue: 取り込み専用の worktree（既定は main の worktree の隣の matomezu-merge-queue。無ければ作る）
//   --addr: 作り直す開発の常駐の待ち受け（既定 127.0.0.1:5300）
// 進め方
//   1. リポジトリに 1 つのロック（flock）を取る。ff と作り直しが終わるまで持つ
//   2. ブランチを SHA に直し、main の上に順に重ねる。マージのコミットのはじめの親はブランチ（main にはマージのコミットを作らない）。
//      衝突したブランチは外して残りで続ける。サブのブランチの ref は動かさない
//   3. lint → typecheck → bun test → go test を流し、どれも通れば e2e。落ちたテストのファイルは 1 回だけ流し直し、通れば「揺れた」として通す
//   4. 通れば main を fast-forward する。main がその間に進んでいたら、重ねる所からやり直す
//   5. 2 件以上を重ねて落ちたら、1 件ずつ順に 2〜4 を流す（通った物は入る）
//   6. 入った差分で、bun install・web/dist のビルド・Go の常駐の入れ替え・Claude Code のプラグインのキャッシュの入れ直しを決めて行う
// 終わりに、入った物・外した物・揺れたテスト・作り直した物を数行で出す。全部が入れば 0 で終わる
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

export type Candidate = { name: string; sha: string }
export type Conflict = { name: string; files: string[] }
// onTip は tip に重ねた物（main に入るのは、テストが通って ff できたとき）
export type Stacked = { tip: string; onTip: Candidate[]; already: Candidate[]; conflicts: Conflict[] }

const MAX_ROUNDS = 3
const MAX_STARTS = 3

export function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

function gitOk(dir: string, ...args: string[]): boolean {
  return spawnSync("git", args, { cwd: dir, stdio: "ignore" }).status === 0
}

const short = (sha: string) => sha.slice(0, 8)

// base の上に候補を順に重ねる。queue は取り込み専用の worktree（中の変更は捨てる）
export function stack(queue: string, base: string, candidates: Candidate[]): Stacked {
  let tip = base
  const onTip: Candidate[] = []
  const already: Candidate[] = []
  const conflicts: Conflict[] = []
  for (const c of candidates) {
    if (gitOk(queue, "merge-base", "--is-ancestor", c.sha, tip)) {
      already.push(c)
      continue
    }
    if (gitOk(queue, "merge-base", "--is-ancestor", tip, c.sha)) {
      tip = c.sha
      onTip.push(c)
      continue
    }
    git(queue, "checkout", "-q", "-f", "--detach", c.sha)
    const message = `Merge ${tip === base ? "main" : "the queue"} (${short(tip)}) into ${c.name}`
    if (gitOk(queue, "merge", "--no-ff", "--no-edit", "-m", message, tip)) {
      tip = git(queue, "rev-parse", "HEAD")
      onTip.push(c)
      continue
    }
    const files = git(queue, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean)
    git(queue, "merge", "--abort")
    conflicts.push({ name: c.name, files })
  }
  git(queue, "checkout", "-q", "-f", "--detach", tip)
  return { tip, onTip, already, conflicts }
}

// main を checkout している worktree で main を tip まで進める。main が base から動いていれば moved、
// 追跡するファイルに未コミットがあれば dirty、ほかの理由で進められなければ failed
export function fastForward(main: string, base: string, tip: string): "done" | "moved" | "dirty" | "failed" {
  if (git(main, "rev-parse", "refs/heads/main") !== base) return "moved"
  if (git(main, "status", "--porcelain", "--untracked-files=no") !== "") return "dirty"
  if (gitOk(main, "merge", "-q", "--ff-only", tip)) return "done"
  return git(main, "rev-parse", "refs/heads/main") === base ? "failed" : "moved"
}

// ---- テストの結果を読む ----

export type Failure = { step: string; where: string; title: string }
export type StepResult = { step: string; ok: boolean; failures: Failure[]; flaky: Failure[]; log: string }

// bun test の出力から落ちたテスト（where はテストのファイル）
export function bunFailures(out: string): Failure[] {
  let file = ""
  const failures: Failure[] = []
  for (const line of out.split("\n")) {
    const header = /^(\S+\.test\.tsx?):$/.exec(line)
    if (header) file = header[1] ?? ""
    const fail = /^\(fail\) (.+?)(?: \[[\d.]+m?s\])?$/.exec(line)
    if (fail) failures.push({ step: "unit", where: file, title: fail[1] ?? "" })
  }
  return failures
}

// go test -json の出力から落ちたテスト（where はパッケージ。title が空なのはテストの外での落ち＝ビルドの失敗など）
export function goFailures(out: string): Failure[] {
  const failures: Failure[] = []
  const failedTests = new Set<string>()
  for (const line of out.split("\n")) {
    if (!line.startsWith("{")) continue
    let e: { Action?: string; Package?: string; Test?: string }
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (e.Action !== "fail" || !e.Package) continue
    if (e.Test) {
      // サブテストは親のテストで流し直す
      const top = e.Test.split("/")[0] ?? e.Test
      const key = `${e.Package} ${top}`
      if (!failedTests.has(key)) failures.push({ step: "go", where: e.Package, title: top })
      failedTests.add(key)
    } else if (![...failedTests].some(k => k.startsWith(`${e.Package} `))) {
      failures.push({ step: "go", where: e.Package, title: "" })
    }
  }
  return failures
}

// bun test の集計と読み取った落ちが合い、テストの外の誤りが無いか（合わなければ流し直さない）
export function bunComplete(out: string, failures: Failure[]): boolean {
  const fail = /^\s*(\d+) fail$/m.exec(out)
  return !/^\s*\d+ errors?$/m.test(out) && Number(fail?.[1] ?? -1) === failures.length
}

type PwSpec = { title: string; file: string; line: number; tests: { status: string }[] }
type PwSuite = { title: string; specs?: PwSpec[]; suites?: PwSuite[] }

// playwright の json の報告から落ちたテスト（where は e2e のファイルと行）
export function playwrightFailures(json: string): Failure[] {
  let report: { suites?: PwSuite[]; errors?: { message?: string }[] }
  try {
    report = JSON.parse(json)
  } catch {
    return [{ step: "e2e", where: "", title: "no report" }]
  }
  const failures: Failure[] = []
  const walk = (suite: PwSuite, path: string[]) => {
    for (const spec of suite.specs ?? [])
      if (spec.tests.some(t => t.status === "unexpected"))
        failures.push({ step: "e2e", where: `${spec.file}:${spec.line}`, title: [...path, spec.title].join(" > ") })
    for (const s of suite.suites ?? []) walk(s, [...path, s.title])
  }
  for (const s of report.suites ?? []) walk(s, [])
  if (failures.length === 0 && (report.errors?.length ?? 0) > 0)
    failures.push({ step: "e2e", where: "", title: report.errors?.[0]?.message?.split("\n")[0] ?? "error" })
  return failures
}

// playwright の集計と読み取った落ちが合い、テストの外の誤りが無いか（合わなければ流し直さない）
export function playwrightComplete(json: string, failures: Failure[]): boolean {
  try {
    const report = JSON.parse(json) as { stats?: { unexpected?: number }; errors?: unknown[] }
    return (report.errors?.length ?? 0) === 0 && report.stats?.unexpected === failures.length
  } catch {
    return false
  }
}

// lint と typecheck の出力から、誤りの行を少し
export function errorLines(step: string, out: string, max = 5): Failure[] {
  return out
    .split("\n")
    .filter(l => /error/i.test(l))
    .slice(0, max)
    .map(l => ({ step, where: "", title: l.trim() }))
}

// ---- 作り直しの見分け ----

export type Rebuilds = { install: boolean; web: boolean; go: boolean; plugin: boolean }

// 変わったファイル（リポジトリからの相対）と、Go の実行ファイルに埋め込まれるファイルから、作り直す物を決める
export function rebuildsFor(paths: string[], embeds: ReadonlySet<string>): Rebuilds {
  const install = paths.some(p => p === "package.json" || p === "bun.lock")
  return {
    install,
    web:
      install ||
      paths.some(
        p =>
          (p.startsWith("web/") && !p.startsWith("web/dist/")) ||
          p === "scripts/web-build.ts" ||
          p === "scripts/fonts.ts",
      ),
    go: paths.some(p => p.endsWith(".go") || p === "go.mod" || p === "go.sum" || embeds.has(p)),
    plugin: paths.some(p => p.startsWith("clients/claude-code/")),
  }
}

// ./cmd/matomezu が埋め込むファイル（main の worktree の中の物だけ、相対）
function embedFiles(main: string): Set<string> {
  const out = execFileSync(
    "go",
    ["list", "-deps", "-f", '{{$d := .Dir}}{{range .EmbedFiles}}{{$d}}/{{.}}{{"\\n"}}{{end}}', "./cmd/matomezu"],
    { cwd: main, encoding: "utf8" },
  )
  return new Set(
    out
      .split("\n")
      .filter(p => p.startsWith(`${main}/`))
      .map(p => relative(main, p)),
  )
}

// ---- テストを流す ----

async function run(cmd: string[], cwd: string, log: string, env: Record<string, string> = {}): Promise<number> {
  const fd = openSync(log, "w")
  try {
    const [bin = "", ...args] = cmd
    const child = spawn(bin, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", fd, fd] })
    return await new Promise(res => child.on("close", code => res(code ?? 1)))
  } finally {
    closeSync(fd)
  }
}

export type Step = {
  step: string
  cmd: string[]
  failures: (out: string, logs: string) => Failure[]
  // 読み取った落ちが全部か（集計と合うか）。合わなければ流し直さない
  complete?: (out: string, logs: string, failures: Failure[]) => boolean
  // 落ちたテストだけを流し直すコマンド。無ければ流し直さない
  rerun?: (failures: Failure[]) => string[][] | undefined
  env?: (logs: string) => Record<string, string>
}

const pwJson = (logs: string, step: string) => join(logs, `${step}.json`)
const readPwJson = (logs: string) => (existsSync(pwJson(logs, "e2e")) ? readFileSync(pwJson(logs, "e2e"), "utf8") : "")

// 軽い順。どれも通ったときだけ E2E を流す
const LIGHT_STEPS: Step[] = [
  { step: "lint", cmd: ["bun", "run", "lint"], failures: out => errorLines("lint", out) },
  { step: "typecheck", cmd: ["bun", "run", "typecheck"], failures: out => errorLines("typecheck", out) },
  {
    step: "unit",
    cmd: ["bun", "test"],
    failures: bunFailures,
    complete: (out, _logs, failures) => bunComplete(out, failures),
    rerun: fs =>
      fs.every(f => f.where !== "") ? [["bun", "test", ...new Set(fs.map(f => `./${f.where}`))]] : undefined,
  },
  {
    step: "go",
    cmd: ["go", "test", "-json", "./..."],
    failures: goFailures,
    rerun: fs => {
      if (fs.some(f => f.title === "")) return undefined
      const byPkg = new Map<string, Failure[]>()
      for (const f of fs) byPkg.set(f.where, [...(byPkg.get(f.where) ?? []), f])
      return [...byPkg].map(([pkg, list]) => [
        "go",
        "test",
        "-json",
        pkg,
        "-run",
        `^(${list.map(f => f.title).join("|")})$`,
      ])
    },
  },
]

const E2E: Step = {
  step: "e2e",
  cmd: ["bunx", "playwright", "test", "--reporter=list,json"],
  failures: (_out, logs) => playwrightFailures(readPwJson(logs)),
  complete: (_out, logs, failures) => playwrightComplete(readPwJson(logs), failures),
  rerun: fs =>
    fs.every(f => f.where !== "")
      ? [["bunx", "playwright", "test", "--reporter=list,json", ...fs.map(f => f.where)]]
      : undefined,
  env: logs => ({
    PLAYWRIGHT_JSON_OUTPUT_FILE: pwJson(logs, "e2e"),
    PLAYWRIGHT_JSON_OUTPUT_NAME: pwJson(logs, "e2e"),
  }),
}

export async function runStep(s: Step, queue: string, logs: string): Promise<StepResult> {
  const log = join(logs, `${s.step}.log`)
  const env = s.env?.(logs) ?? {}
  if ((await run(s.cmd, queue, log, env)) === 0) return { step: s.step, ok: true, failures: [], flaky: [], log }
  const out = readFileSync(log, "utf8")
  const failures = s.failures(out, logs)
  const whole = failures.length > 0 && (s.complete?.(out, logs, failures) ?? true)
  const reruns = whole ? s.rerun?.(failures) : undefined
  if (!reruns) return { step: s.step, ok: false, failures, flaky: [], log }
  for (const [i, cmd] of reruns.entries()) {
    const again = join(logs, `${s.step}.rerun${i}.log`)
    if ((await run(cmd, queue, again, env)) !== 0) {
      const still = s.failures(readFileSync(again, "utf8"), logs)
      return { step: s.step, ok: false, failures: still.length > 0 ? still : failures, flaky: [], log: again }
    }
  }
  return { step: s.step, ok: true, failures: [], flaky: failures, log }
}

// 軽い物は全部流して落ちた所をまとめて返し、どれも通ったときだけ e2e を流す
async function testAll(queue: string, logs: string): Promise<StepResult[]> {
  mkdirSync(logs, { recursive: true })
  if ((await run(["bun", "install", "--frozen-lockfile"], queue, join(logs, "install.log"))) !== 0)
    return [
      {
        step: "install",
        ok: false,
        failures: [{ step: "install", where: "", title: "bun install" }],
        flaky: [],
        log: join(logs, "install.log"),
      },
    ]
  const results: StepResult[] = []
  for (const s of LIGHT_STEPS) results.push(await runStep(s, queue, logs))
  if (results.every(r => r.ok)) results.push(await runStep(E2E, queue, logs))
  return results
}

// ---- 取り込み ----

type Attempt =
  | { kind: "merged"; stacked: Stacked; flaky: Failure[] }
  | { kind: "failed"; stacked: Stacked; results: StepResult[] }
  | { kind: "nothing"; stacked: Stacked }
  | { kind: "stopped"; reason: string; stacked?: Stacked }

async function attempt(o: Options, candidates: Candidate[]): Promise<Attempt> {
  let stacked: Stacked | undefined
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const base = git(o.main, "rev-parse", "refs/heads/main")
    stacked = stack(o.queue, base, candidates)
    if (stacked.onTip.length === 0) return { kind: "nothing", stacked }
    const results = await testAll(o.queue, join(o.logs, short(stacked.tip)))
    if (!results.every(r => r.ok)) return { kind: "failed", stacked, results }
    const ff = fastForward(o.main, base, stacked.tip)
    if (ff === "dirty")
      return { kind: "stopped", reason: "main の worktree の追跡するファイルに未コミットがある", stacked }
    if (ff === "failed") return { kind: "stopped", reason: "main を fast-forward できなかった", stacked }
    if (ff === "done") return { kind: "merged", stacked, flaky: results.flatMap(r => r.flaky) }
  }
  return { kind: "stopped", reason: `main が進み続け ${MAX_ROUNDS} 回 ff できなかった`, stacked }
}

// ---- 作り直し ----

const portOf = (addr: string) => addr.slice(addr.lastIndexOf(":") + 1)

// 待ち受けている常駐の pid（無ければ undefined）
function listener(addr: string): number | undefined {
  const out = spawnSync("ss", ["-ltnpH", `sport = :${portOf(addr)}`], { encoding: "utf8" }).stdout ?? ""
  const m = /pid=(\d+)/.exec(out)
  return m ? Number(m[1]) : undefined
}

const alive = (pid: number) => existsSync(`/proc/${pid}`)

type Resident = { pid: number; argv: string[]; cwd: string; home: string }

function residentOf(pid: number): Resident | undefined {
  try {
    const argv = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean)
    const cwd = readlinkSync(`/proc/${pid}/cwd`)
    const env = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0")
    const home = env.find(e => e.startsWith("MATOMEZU_HOME="))?.slice("MATOMEZU_HOME=".length)
    return home ? { pid, argv, cwd, home: resolve(cwd, home) } : undefined
  } catch {
    return undefined
  }
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(300)) if (check()) return true
  return check()
}

const sameArgs = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

// 常駐を同じ引数・作業フォルダ・MATOMEZU_HOME で入れ替える。止めるのは pid で、起動は別のプロセス
async function replaceResident(main: string, addr: string): Promise<string> {
  const pid = listener(addr)
  const old = pid === undefined ? undefined : residentOf(pid)
  if (!old) return `常駐の入れ替えが要る（${addr} に MATOMEZU_HOME の分かる常駐が無い）`
  const bin = resolve(old.cwd, old.argv[0] ?? "")
  execFileSync("go", ["build", "-o", `${bin}.new`, "./cmd/matomezu"], { cwd: main, stdio: "ignore" })
  const log = join(old.home, "server.log")
  for (let start = 0; start < MAX_STARTS; start++) {
    const current = listener(addr)
    if (current !== undefined) {
      process.kill(current, "SIGTERM")
      if (!(await waitFor(() => !alive(current) && listener(addr) === undefined, 30_000)))
        return `常駐 ${current} が止まらない`
    }
    if (existsSync(`${bin}.new`)) renameSync(`${bin}.new`, bin)
    const from = existsSync(log) ? statSync(log).size : 0
    const fd = openSync(log, "a")
    spawn("setsid", ["nohup", ...old.argv], {
      cwd: old.cwd,
      env: { ...process.env, MATOMEZU_HOME: old.home },
      detached: true,
      stdio: ["ignore", fd, fd],
    }).unref()
    closeSync(fd)
    if (!(await waitFor(() => listener(addr) !== undefined, 30_000))) return "常駐が起動しない（server.log を見る）"
    const up = listener(addr)
    const now = up === undefined ? undefined : residentOf(up)
    // 止めた隙にほかのセッションが別の引数で起動した常駐なら、止めて立て直す
    if (!now || !sameArgs(now.argv, old.argv) || now.home !== old.home) continue
    const added = readFileSync(log, "utf8").slice(from)
    if (/is not added/.test(added)) return `常駐 ${now.pid} を起動した。server.log に「is not added」がある`
    return `常駐を入れ替えた（pid ${now.pid}）`
  }
  return `常駐を ${MAX_STARTS} 回立て直しても同じ引数で起動しなかった`
}

function pluginCache(main: string): string | undefined {
  const manifest = join(main, "clients/claude-code/.claude-plugin/plugin.json")
  const { name, version } = JSON.parse(readFileSync(manifest, "utf8")) as { name: string; version: string }
  const dir = join(homedir(), ".claude/plugins/cache", name, name, version)
  return existsSync(dir) ? dir : undefined
}

// main の worktree で、from..to の差分に要る物を作り直し、したことを 1 行ずつ返す
async function rebuild(o: Options, from: string, to: string): Promise<string[]> {
  const paths = git(o.main, "diff", "--name-only", from, to).split("\n").filter(Boolean)
  const done: string[] = []
  // 1 つが投げても、ほかと結果のまとめは続ける
  const guard = async (name: string, f: () => Promise<boolean>) => {
    try {
      return await f()
    } catch (e) {
      done.push(`${name} に失敗（${e instanceof Error ? e.message.split("\n")[0] : String(e)}）`)
      return false
    }
  }
  let r: Rebuilds | undefined
  await guard("作り直す物の見分け", async () => {
    r = rebuildsFor(paths, embedFiles(o.main))
    return true
  })
  if (!r) return done
  const need = r
  const logs = join(o.logs, `rebuild-${short(to)}`)
  mkdirSync(logs, { recursive: true })
  // file はログのファイルの名前（name は出力に出す名前で、/ などを含む）
  const step = (name: string, file: string, cmd: string[]) =>
    guard(name, async () => {
      const log = join(logs, `${file}.log`)
      const ok = (await run(cmd, o.main, log)) === 0
      done.push(ok ? name : `${name} に失敗（${log}）`)
      return ok
    })
  if (need.install && !(await step("bun install", "install", ["bun", "install", "--frozen-lockfile"]))) return done
  if (need.web) await step("web/dist のビルド", "web", ["bun", "run", "build"])
  if (need.go)
    await guard("常駐の入れ替え", async () => {
      done.push(await replaceResident(o.main, o.addr))
      return true
    })
  if (need.plugin)
    await guard("プラグインの入れ直し", async () => {
      const cache = pluginCache(o.main)
      if (cache)
        return step("プラグインのキャッシュの入れ直し", "plugin", [
          "rsync",
          "-a",
          "--delete",
          "clients/claude-code/",
          `${cache}/`,
        ])
      done.push("プラグインの入れ直しが要る（キャッシュが無い）")
      return false
    })
  return done
}

function ensureQueue(main: string, queue: string): void {
  if (existsSync(join(queue, ".git"))) return
  git(main, "worktree", "add", "--detach", queue, "HEAD")
}

const describe = (f: Failure) => `${f.step}: ${[f.where, f.title].filter(Boolean).join(" ")}`

// 落ちたステップの理由。読み取れた落ちが無ければログのパス
const whyOf = (results: StepResult[]) =>
  results.filter(r => !r.ok).flatMap(r => (r.failures.length > 0 ? r.failures.map(describe) : [`${r.step}: ${r.log}`]))

// 結果を数行に
function summary(
  merged: Candidate[],
  failed: { name: string; why: string[] }[],
  conflicts: Conflict[],
  already: Candidate[],
  flaky: Failure[],
  rebuilt: string[],
): string[] {
  const lines: string[] = []
  if (merged.length > 0) lines.push(`入った: ${merged.map(c => `${c.name} ${short(c.sha)}`).join("、")}`)
  for (const c of already) lines.push(`入っていた: ${c.name} ${short(c.sha)}`)
  for (const c of conflicts) lines.push(`衝突: ${c.name}（${c.files.join("、")}）`)
  for (const f of failed) lines.push(`落ちた: ${f.name}`, ...f.why.slice(0, 8).map(w => `  ${w}`))
  if (flaky.length > 0) lines.push(`揺れた: ${flaky.map(describe).join("、")}`)
  if (rebuilt.length > 0) lines.push(`作り直し: ${rebuilt.join("、")}`)
  return lines
}

// ---- 入口 ----

export type Options = { main: string; queue: string; addr: string; logs: string; rebuild: boolean }

function parseArgs(argv: string[]): { options: Omit<Options, "logs">; branches: string[] } {
  const scriptRepo = dirname(import.meta.dir)
  let main = scriptRepo
  let queue: string | undefined
  let addr = "127.0.0.1:5300"
  let rebuild = true
  const branches: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--main") main = resolve(argv[++i] ?? "")
    else if (a === "--queue") queue = resolve(argv[++i] ?? "")
    else if (a === "--addr") addr = argv[++i] ?? addr
    else if (a === "--no-rebuild") rebuild = false
    else if (a !== undefined) branches.push(a)
  }
  return { options: { main, queue: queue ?? join(dirname(main), "matomezu-merge-queue"), addr, rebuild }, branches }
}

async function main(argv: string[]): Promise<number> {
  const { options, branches } = parseArgs(argv)
  if (branches.length === 0) {
    console.error(
      "bun scripts/merge-queue.ts [--main <dir>] [--queue <dir>] [--addr <host:port>] [--no-rebuild] <ブランチ>...",
    )
    return 2
  }
  if (
    spawnSync("git", ["symbolic-ref", "-q", "HEAD"], { cwd: options.main, encoding: "utf8" }).stdout.trim() !==
    "refs/heads/main"
  ) {
    console.error(`${options.main} は main を checkout していない（--main で main の worktree を渡す）`)
    return 2
  }
  const common = resolve(options.main, git(options.main, "rev-parse", "--git-common-dir"))
  const o: Options = { ...options, logs: join(common, "merge-queue") }
  const candidates = branches.map(name => ({ name, sha: git(o.main, "rev-parse", "--verify", `${name}^{commit}`) }))
  ensureQueue(o.main, o.queue)
  const start = git(o.main, "rev-parse", "refs/heads/main")

  const merged: Candidate[] = []
  const already: Candidate[] = []
  const conflicts: Conflict[] = []
  const failed: { name: string; why: string[] }[] = []
  const flaky: Failure[] = []
  const take = (a: Attempt): boolean => {
    if (a.stacked) {
      already.push(...a.stacked.already)
      conflicts.push(...a.stacked.conflicts)
    }
    if (a.kind === "merged") {
      merged.push(...a.stacked.onTip)
      flaky.push(...a.flaky)
    }
    if (a.kind === "stopped") failed.push({ name: a.stacked?.onTip.map(c => c.name).join("、") ?? "", why: [a.reason] })
    return a.kind !== "stopped"
  }

  const first = await attempt(o, candidates)
  if (first.kind === "failed" && first.stacked.onTip.length > 1) {
    // 重ねて落ちたら 1 件ずつ。衝突したブランチは外してある
    for (const c of first.stacked.onTip) {
      const one = await attempt(o, [c])
      if (one.kind === "failed") failed.push({ name: c.name, why: whyOf(one.results) })
      else if (!take(one)) break
    }
    if (failed.length === 0)
      flaky.push({ step: "まとめ", where: "", title: "重ねると落ち、1 件ずつでは通った（揺れか組み合わせ）" })
    already.push(...first.stacked.already)
    conflicts.push(...first.stacked.conflicts)
  } else if (first.kind === "failed") {
    take({ kind: "nothing", stacked: first.stacked })
    failed.push({
      name: first.stacked.onTip.map(c => c.name).join("、"),
      why: whyOf(first.results),
    })
  } else take(first)

  const end = git(o.main, "rev-parse", "refs/heads/main")
  const rebuilt = o.rebuild && end !== start ? await rebuild(o, start, end) : []
  for (const line of summary(merged, failed, conflicts, already, flaky, rebuilt)) console.log(line)
  return failed.length === 0 && conflicts.length === 0 ? 0 : 1
}

// ロックの中で動かし直す（スクリプトが落ちても flock が外す）
if (import.meta.main) {
  if (process.env.MERGE_QUEUE_LOCKED === "1") process.exit(await main(process.argv.slice(2)))
  const { options } = parseArgs(process.argv.slice(2))
  const lock = join(resolve(options.main, git(options.main, "rev-parse", "--git-common-dir")), "merge-queue.lock")
  const r = spawnSync("flock", [lock, process.execPath, import.meta.path, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, MERGE_QUEUE_LOCKED: "1" },
  })
  process.exit(r.status ?? 1)
}
