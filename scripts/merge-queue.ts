// 平行作業のブランチを main へ取り込むキュー。取り込み専用の worktree でブランチに main を取り込み、全部のテストを 1 か所で流し、
// 通れば main を fast-forward して、差分に応じて開発の常駐を作り直す
//   bun scripts/merge-queue.ts [--main <dir>] [--queue <dir>] [--port <ポート>] [--no-rebuild] [--push] [--result <file>] <ブランチ>[:<sha>]...
//   <ブランチ>:<sha>: ブランチの名前でその sha を入れる（sha が無ければ、ロックを取った時のブランチの先）
//   --main: main を checkout している worktree（既定はこのスクリプトのあるリポジトリ）
//   --queue: 取り込み専用の worktree（既定は main の worktree の隣の matomezu-merge-queue。無ければ作る）
//   --port: 作り直す開発の常駐の待ち受け（既定は、main の .dev-home の常駐が server.json に書いたポート）
//   --push: main が進んだら origin へ push する
//   --result: 結果（Report）を json で書くファイル
// 進め方
//   1. リポジトリに 1 つのロック（flock）を取る。ff と作り直しが終わるまで持つ
//   2. ブランチを SHA に直し、main の上に順に重ねる。マージのコミットのはじめの親はブランチ（main にはマージのコミットを作らない）。
//      衝突したブランチは外して残りで続ける。サブのブランチの ref は動かさない。
//      ソースから作る engine.js は、衝突したのがそれだけのときと、両側が変えてきれいにマージできたときに作り直して重ねる
//   3. lint → typecheck → bun test → go test を流し、どれも通れば e2e。落ちたテストは 1 回だけ流し直す。
//      流し直して通り、落ちたテストが全部 FLAKY_LIST にあれば「揺れた」として通す。一覧に無い物があれば外し、流し直した結果を添えて返す
//   4. 通れば main を fast-forward する。main がその間に進んでいたら、重ねる所からやり直す
//   5. 2 件以上を重ねて落ちたら、1 件ずつ順に 2〜4 を流す（通った物は入る）
//   6. --push なら、main が進んだときに origin へ push する。失敗したら要約に出し、0 以外で終わる
//   7. 入った差分で、bun install・web/dist のビルド・Go の常駐の入れ替え・Claude Code のプラグインのキャッシュの入れ直しを決めて行う
// 終わりに、入った物・外した物・揺れたテスト・push・作り直した物を数行で出し、ブランチごとに 1 行を HISTORY に足す。全部が入り push もできれば 0 で終わる
import { execFileSync, spawn, spawnSync } from "node:child_process"
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

export type Candidate = { name: string; sha: string }
// why は作り直せなかったときのログ
export type Conflict = { name: string; files: string[]; why?: string }
// onTip は tip に重ねた物（main に入るのは、テストが通って ff できたとき）。regenerated はそのうち GENERATED を作り直して重ねた物
export type Stacked = {
  tip: string
  onTip: Candidate[]
  already: Candidate[]
  conflicts: Conflict[]
  regenerated: Candidate[]
}

// ソースから作る物。両側が変えていれば、マージした中身はどちらのソースから作った物とも違うので作り直す
export const GENERATED = { path: "internal/engine/engine.js", script: "build:engine" }

// 取り込み専用の worktree で GENERATED を作り直す。log はその出力
export type Regenerate = (queue: string) => { ok: boolean; log: string }

const MAX_ROUNDS = 3
const MAX_STARTS = 3

export function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

function gitOk(dir: string, ...args: string[]): boolean {
  return spawnSync("git", args, { cwd: dir, stdio: "ignore" }).status === 0
}

const short = (sha: string) => sha.slice(0, 8)

// base から見て、ours と theirs の両方で path が変わっているか
function bothChanged(queue: string, ours: string, theirs: string, path: string): boolean {
  const base = git(queue, "merge-base", ours, theirs)
  const changed = (side: string) => !gitOk(queue, "diff", "--quiet", base, side, "--", path)
  return changed(ours) && changed(theirs)
}

// base の上に候補を順に重ねる。queue は取り込み専用の worktree（中の変更は捨てる）
export function stack(queue: string, base: string, candidates: Candidate[], regenerate: Regenerate): Stacked {
  let tip = base
  const onTip: Candidate[] = []
  const already: Candidate[] = []
  const conflicts: Conflict[] = []
  const regenerated: Candidate[] = []
  const put = (c: Candidate) => {
    tip = git(queue, "rev-parse", "HEAD")
    onTip.push(c)
  }
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
    const clean = gitOk(queue, "merge", "--no-ff", "--no-edit", "-m", message, tip)
    const files = clean ? [] : git(queue, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean)
    const toRegenerate = clean
      ? bothChanged(queue, tip, c.sha, GENERATED.path)
      : files.length === 1 && files[0] === GENERATED.path
    if (!toRegenerate) {
      if (clean) put(c)
      else {
        git(queue, "merge", "--abort")
        conflicts.push({ name: c.name, files })
      }
      continue
    }
    const r = regenerate(queue)
    if (!r.ok) {
      git(queue, "reset", "-q", "--hard")
      conflicts.push({ name: c.name, files: [GENERATED.path], why: r.log })
      continue
    }
    git(queue, "add", GENERATED.path)
    // 衝突したマージを --no-edit で閉じると「# Conflicts:」が残るので、いつものメッセージを渡す
    if (!clean) git(queue, "commit", "-q", "-m", message)
    else if (!gitOk(queue, "diff", "--cached", "--quiet")) git(queue, "commit", "-q", "--amend", "-m", message)
    regenerated.push(c)
    put(c)
  }
  git(queue, "checkout", "-q", "-f", "--detach", tip)
  return { tip, onTip, already, conflicts, regenerated }
}

// GENERATED を package.json のスクリプトで作り直す。NODE_ENV は test/engine.test.ts と同じ production で組む
export function regenerateWith(logs: string): Regenerate {
  return queue => {
    mkdirSync(logs, { recursive: true })
    const log = join(logs, "regenerate.log")
    const fd = openSync(log, "w")
    try {
      const out = { cwd: queue, stdio: ["ignore", fd, fd] as ("ignore" | number)[] }
      const ok =
        spawnSync("bun", ["install", "--frozen-lockfile"], out).status === 0 &&
        spawnSync("bun", ["run", GENERATED.script], { ...out, env: { ...process.env, NODE_ENV: "production" } })
          .status === 0
      return { ok, log }
    } finally {
      closeSync(fd)
    }
  }
}

// main を checkout している worktree で main を tip まで進める。main が base から動いていれば moved、
// 追跡するファイルに未コミットがあれば dirty、ほかの理由で進められなければ failed
export function fastForward(main: string, base: string, tip: string): "done" | "moved" | "dirty" | "failed" {
  if (git(main, "rev-parse", "refs/heads/main") !== base) return "moved"
  if (git(main, "status", "--porcelain", "--untracked-files=no") !== "") return "dirty"
  if (gitOk(main, "merge", "-q", "--ff-only", tip)) return "done"
  return git(main, "rev-parse", "refs/heads/main") === base ? "failed" : "moved"
}

// main を origin へ push する。失敗したら理由の 1 行
export function pushMain(main: string): { ok: true } | { ok: false; why: string } {
  const r = spawnSync("git", ["push", "-q", "origin", "main"], { cwd: main, encoding: "utf8" })
  if (r.status === 0) return { ok: true }
  return { ok: false, why: (r.stderr || r.stdout || `終了コード ${r.status}`).trim().split("\n")[0] ?? "" }
}

// ---- テストの結果を読む ----

export type Failure = { step: string; where: string; title: string }
// rerun は落ちたテストを流し直した結果（流し直さなかったら none）
export type StepResult = {
  step: string
  ok: boolean
  failures: Failure[]
  flaky: Failure[]
  log: string
  rerun: "none" | "passed" | "failed"
}

// 揺れるテストの一覧。1 行に「ステップ名 ファイル:テスト名」（e2e の行番号は動くので書かない。go はファイルでなくパッケージ）。
// # で始まる行と空の行は読まない。キューは、重ねる main の側の物だけを読む（ブランチが自分で足して通せない）
export const FLAKY_LIST = "scripts/merge-queue-flaky.txt"

export function flakyKey(f: Failure): string | undefined {
  const where = f.step === "e2e" ? f.where.replace(/:\d+$/, "") : f.where
  return where && f.title ? `${f.step} ${where}:${f.title}` : undefined
}

export function parseFlakyList(text: string): Set<string> {
  return new Set(
    text
      .split("\n")
      .map(l => l.trim())
      .filter(l => l !== "" && !l.startsWith("#")),
  )
}

function flakyListAt(main: string, base: string): Set<string> {
  const r = spawnSync("git", ["show", `${base}:${FLAKY_LIST}`], { cwd: main, encoding: "utf8" })
  return r.status === 0 ? parseFlakyList(r.stdout) : new Set()
}

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

// 落ちたテストは 1 回だけ流し直す。流し直して通っても、通しにするのは落ちたテストが全部 flakyList にあるときだけ。
// 一覧に無い物があれば、それを落ちとして返す（rerun が passed なら揺れの候補）
export async function runStep(
  s: Step,
  queue: string,
  logs: string,
  flakyList = new Set<string>(),
): Promise<StepResult> {
  const log = join(logs, `${s.step}.log`)
  const env = s.env?.(logs) ?? {}
  const result = (r: Omit<StepResult, "step">): StepResult => ({ step: s.step, ...r })
  if ((await run(s.cmd, queue, log, env)) === 0)
    return result({ ok: true, failures: [], flaky: [], log, rerun: "none" })
  const out = readFileSync(log, "utf8")
  const failures = s.failures(out, logs)
  const whole = failures.length > 0 && (s.complete?.(out, logs, failures) ?? true)
  const reruns = whole ? s.rerun?.(failures) : undefined
  if (!reruns) return result({ ok: false, failures, flaky: [], log, rerun: "none" })
  for (const [i, cmd] of reruns.entries()) {
    const again = join(logs, `${s.step}.rerun${i}.log`)
    if ((await run(cmd, queue, again, env)) !== 0) {
      const still = s.failures(readFileSync(again, "utf8"), logs)
      return result({
        ok: false,
        failures: still.length > 0 ? still : failures,
        flaky: [],
        log: again,
        rerun: "failed",
      })
    }
  }
  const unlisted = failures.filter(f => !flakyList.has(flakyKey(f) ?? ""))
  if (unlisted.length > 0) return result({ ok: false, failures: unlisted, flaky: [], log, rerun: "passed" })
  return result({ ok: true, failures: [], flaky: failures, log, rerun: "passed" })
}

// 軽い物は全部流して落ちた所をまとめて返し、どれも通ったときだけ e2e を流す
async function testAll(queue: string, logs: string, flakyList: Set<string>): Promise<StepResult[]> {
  mkdirSync(logs, { recursive: true })
  if ((await run(["bun", "install", "--frozen-lockfile"], queue, join(logs, "install.log"))) !== 0)
    return [
      {
        step: "install",
        ok: false,
        failures: [{ step: "install", where: "", title: "bun install" }],
        flaky: [],
        log: join(logs, "install.log"),
        rerun: "none",
      },
    ]
  const results: StepResult[] = []
  for (const s of LIGHT_STEPS) results.push(await runStep(s, queue, logs, flakyList))
  if (results.every(r => r.ok)) results.push(await runStep(E2E, queue, logs, flakyList))
  return results
}

// ---- 取り込み ----

type Attempt =
  | { kind: "merged"; stacked: Stacked; flaky: Failure[] }
  | { kind: "failed"; stacked: Stacked; base: string; logs: string; results: StepResult[] }
  | { kind: "nothing"; stacked: Stacked }
  | { kind: "stopped"; reason: string; stacked?: Stacked }

async function attempt(o: Options, candidates: Candidate[]): Promise<Attempt> {
  let stacked: Stacked | undefined
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const base = git(o.main, "rev-parse", "refs/heads/main")
    stacked = stack(o.queue, base, candidates, regenerateWith(join(o.logs, "regenerate")))
    if (stacked.onTip.length === 0) return { kind: "nothing", stacked }
    const logs = join(o.logs, short(stacked.tip))
    const results = await testAll(o.queue, logs, flakyListAt(o.main, base))
    if (!results.every(r => r.ok)) return { kind: "failed", stacked, base, logs, results }
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

// main の開発の常駐（.dev-home）が待つポート（server.json の URL から。立っていなければ空で、入れ替えは常駐が無いと言う）
function devPort(main: string): string {
  try {
    const { url } = JSON.parse(readFileSync(join(main, ".dev-home", "server.json"), "utf8")) as { url: string }
    return new URL(url).port
  } catch {
    return ""
  }
}

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
  if (portOf(addr) === "") return "常駐の入れ替えが要る（main の .dev-home に立っている常駐が無い）"
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

const RERUN_NOTE = { none: "", passed: "（流し直しで通った。一覧に無い）", failed: "（流し直しても落ちた）" }

// 落ちたステップの理由。読み取れた落ちが無ければログのパス
const whyOf = (results: StepResult[]) =>
  results
    .filter(r => !r.ok)
    .flatMap(r =>
      r.failures.length > 0 ? r.failures.map(f => describe(f) + RERUN_NOTE[r.rerun]) : [`${r.step}: ${r.log}`],
    )

// ブランチごとの行き先。failed の base は重ねた main、logs はそのテストのログの置き場。
// main-side は main の側の都合（main の worktree の未コミットなど）で入れられなかった物
export type Outcome = Candidate &
  (
    | { kind: "merged" | "already" }
    | { kind: "conflict"; files: string[]; why?: string }
    | { kind: "failed"; base: string; logs: string; why: string[] }
    | { kind: "main-side"; why: string }
  )

export type Pushed = { ok: true } | { ok: false; why: string }

// キューの 1 回の結果。--result のファイルにこの形で書く
export type Report = {
  outcomes: Outcome[]
  regenerated: Candidate[]
  flaky: Failure[]
  pushed?: Pushed
  rebuilt: string[]
}

// 結果を数行に
export function summary(r: Report): string[] {
  const lines: string[] = []
  const merged = r.outcomes.filter(o => o.kind === "merged")
  if (merged.length > 0) lines.push(`入った: ${merged.map(c => `${c.name} ${short(c.sha)}`).join("、")}`)
  for (const o of r.outcomes) if (o.kind === "already") lines.push(`入っていた: ${o.name} ${short(o.sha)}`)
  for (const c of r.regenerated) lines.push(`作り直して解いた: ${c.name}（${GENERATED.path}）`)
  for (const o of r.outcomes) {
    if (o.kind === "conflict")
      lines.push(`衝突: ${o.name}（${o.files.join("、")}）`, ...(o.why ? [`  作り直せなかった: ${o.why}`] : []))
    if (o.kind === "failed")
      lines.push(
        `落ちた: ${o.name}（main ${short(o.base)} に重ねた。ログ ${o.logs}）`,
        ...o.why.slice(0, 8).map(w => `  ${w}`),
      )
    if (o.kind === "main-side") lines.push(`main の側で止めた: ${o.name}（${o.why}）`)
  }
  if (r.flaky.length > 0) lines.push(`揺れた: ${r.flaky.map(describe).join("、")}`)
  if (r.pushed) lines.push(r.pushed.ok ? "push 済み" : `push に失敗（${r.pushed.why}）`)
  if (r.rebuilt.length > 0) lines.push(`作り直し: ${r.rebuilt.join("、")}`)
  return lines
}

// 履歴の 1 行（タブで区切る）: 時刻・ブランチ・sha・行き先・理由のはじめ
export function historyLine(o: Outcome, at: Date): string {
  const why =
    o.kind === "conflict"
      ? o.files.join(" ")
      : o.kind === "failed"
        ? `${o.why[0] ?? ""} ログ ${o.logs}`
        : o.kind === "main-side"
          ? o.why
          : ""
  return [at.toISOString(), o.name, short(o.sha), o.kind, why].join("\t")
}

export const HISTORY = "history.tsv"

// ---- 入口 ----

export type Options = {
  main: string
  queue: string
  addr: string
  logs: string
  rebuild: boolean
  push: boolean
  result?: string
}

export const USAGE =
  "bun scripts/merge-queue.ts [--main <dir>] [--queue <dir>] [--port <ポート>] [--no-rebuild] [--push] [--result <file>] <ブランチ>[:<sha>]..."

function parseArgs(argv: string[]): { options: Omit<Options, "logs">; branches: string[] } {
  const scriptRepo = dirname(import.meta.dir)
  let main = scriptRepo
  let queue: string | undefined
  let port: string | undefined
  let rebuild = true
  let push = false
  let result: string | undefined
  const branches: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--main") main = resolve(argv[++i] ?? "")
    else if (a === "--queue") queue = resolve(argv[++i] ?? "")
    else if (a === "--port") port = argv[++i]
    else if (a === "--no-rebuild") rebuild = false
    else if (a === "--push") push = true
    else if (a === "--result") result = resolve(argv[++i] ?? "")
    else if (a !== undefined) branches.push(a)
  }
  return {
    options: {
      main,
      queue: queue ?? join(dirname(main), "matomezu-merge-queue"),
      addr: `127.0.0.1:${port ?? devPort(main)}`,
      rebuild,
      push,
      result,
    },
    branches,
  }
}

// <ブランチ>:<sha> なら、その sha を入れる（ref に : は使えない）。sha が無ければ、いまのブランチの先
export function candidateOf(dir: string, arg: string): Candidate {
  const at = arg.indexOf(":")
  const name = at < 0 ? arg : arg.slice(0, at)
  return { name, sha: git(dir, "rev-parse", "--verify", `${at < 0 ? name : arg.slice(at + 1)}^{commit}`) }
}

async function main(argv: string[]): Promise<number> {
  const { options, branches } = parseArgs(argv)
  if (branches.length === 0) {
    console.error(USAGE)
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
  const candidates = branches.map(b => candidateOf(o.main, b))
  ensureQueue(o.main, o.queue)
  const start = git(o.main, "rev-parse", "refs/heads/main")

  const outcomes: Outcome[] = []
  const regenerated: Candidate[] = []
  const flaky: Failure[] = []
  const shaOf = (name: string) => candidates.find(c => c.name === name)?.sha ?? ""
  const stackedOutcomes = (s: Stacked) =>
    outcomes.push(
      ...s.already.map(c => ({ ...c, kind: "already" as const })),
      ...s.conflicts.map(c => ({
        name: c.name,
        sha: shaOf(c.name),
        kind: "conflict" as const,
        files: c.files,
        why: c.why,
      })),
    )
  const failedOutcome = (c: Candidate, a: Attempt & { kind: "failed" }): Outcome => ({
    ...c,
    kind: "failed",
    base: a.base,
    logs: a.logs,
    why: whyOf(a.results),
  })
  const take = (a: Attempt): boolean => {
    if (a.stacked) stackedOutcomes(a.stacked)
    if (a.kind === "merged") {
      outcomes.push(...a.stacked.onTip.map(c => ({ ...c, kind: "merged" as const })))
      regenerated.push(...a.stacked.regenerated)
      flaky.push(...a.flaky)
    }
    if (a.kind === "stopped")
      outcomes.push(...(a.stacked?.onTip ?? []).map(c => ({ ...c, kind: "main-side" as const, why: a.reason })))
    return a.kind !== "stopped"
  }

  const first = await attempt(o, candidates)
  if (first.kind === "failed" && first.stacked.onTip.length > 1) {
    // 重ねて落ちたら 1 件ずつ。衝突したブランチは外してある
    let anyFailed = false
    for (const c of first.stacked.onTip) {
      const one = await attempt(o, [c])
      if (one.kind === "failed") {
        anyFailed = true
        outcomes.push(failedOutcome(c, one))
      } else if (!take(one)) break
    }
    if (!anyFailed)
      flaky.push({ step: "まとめ", where: "", title: "重ねると落ち、1 件ずつでは通った（揺れか組み合わせ）" })
    stackedOutcomes(first.stacked)
  } else if (first.kind === "failed") {
    stackedOutcomes(first.stacked)
    outcomes.push(...first.stacked.onTip.map(c => failedOutcome(c, first)))
  } else take(first)

  const end = git(o.main, "rev-parse", "refs/heads/main")
  // 作り直しはこの機械の中の事なので、先に push して main を外へ出す
  const pushed = o.push && end !== start ? pushMain(o.main) : undefined
  const rebuilt = o.rebuild && end !== start ? await rebuild(o, start, end) : []
  const report: Report = { outcomes, regenerated, flaky, pushed, rebuilt }
  const at = new Date()
  mkdirSync(o.logs, { recursive: true })
  for (const out of outcomes) appendFileSync(join(o.logs, HISTORY), `${historyLine(out, at)}\n`)
  if (o.result) writeFileSync(o.result, JSON.stringify(report))
  for (const line of summary(report)) console.log(line)
  return outcomes.every(x => x.kind === "merged" || x.kind === "already") && pushed?.ok !== false ? 0 : 1
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
