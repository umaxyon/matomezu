import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  type Attempt,
  bunComplete,
  bunFailures,
  type Candidate,
  candidateOf,
  collect,
  errorLines,
  fastForward,
  GENERATED,
  git,
  goFailures,
  historyLine,
  playwrightFailures,
  pushMain,
  type Regenerate,
  rebuildsFor,
  runStep,
  type Stacked,
  type Step,
  stack,
  succeeded,
  summary,
} from "../../scripts/merge-queue"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

// main と、main を checkout した worktree と、取り込み専用の worktree を持つ一時のリポジトリ
function repo() {
  const root = mkdtempSync(join(tmpdir(), "merge-queue-"))
  dirs.push(root)
  const main = join(root, "main")
  const queue = join(root, "queue")
  execFileSync("git", ["init", "-q", "-b", "main", main])
  for (const [k, v] of [
    ["user.name", "t"],
    ["user.email", "t@example.com"],
  ] as const)
    git(main, "config", k, v)
  const commit = (file: string, text: string, message: string) => {
    mkdirSync(dirname(join(main, file)), { recursive: true })
    writeFileSync(join(main, file), text)
    git(main, "add", file)
    git(main, "commit", "-q", "-m", message)
    return git(main, "rev-parse", "HEAD")
  }
  commit("a.txt", "a\n", "a")
  const branch = (name: string, file: string, text: string) => {
    git(main, "checkout", "-q", "-b", name, "main")
    const sha = commit(file, text, name)
    git(main, "checkout", "-q", "main")
    return { name, sha }
  }
  git(main, "worktree", "add", "-q", "--detach", queue, "HEAD")
  return { main, queue, commit, branch }
}

// 作り直しの手。呼ばれたら calls に積み、ok なら GENERATED に決まった中身を書く
function fakeRegenerate(ok: boolean) {
  const calls: string[] = []
  const regenerate: Regenerate = queue => {
    calls.push(queue)
    if (ok) writeFileSync(join(queue, GENERATED.path), "rebuilt\n")
    return { ok, log: "/logs/regenerate.log" }
  }
  return { calls, regenerate }
}
// GENERATED に触れない重ねでは呼ばれない
const never: Regenerate = () => {
  throw new Error("作り直しは呼ばれないはず")
}

test("ブランチに main を取り込み、マージのコミットのはじめの親はブランチ。ブランチの ref は動かない", () => {
  const r = repo()
  const b1 = r.branch("b1", "b1.txt", "1\n")
  const advanced = r.commit("m.txt", "m\n", "main moves")
  const s = stack(r.queue, advanced, [b1], never)
  expect(s.onTip).toEqual([b1])
  expect(git(r.queue, "rev-parse", `${s.tip}^1`)).toBe(b1.sha)
  expect(git(r.queue, "rev-parse", `${s.tip}^2`)).toBe(advanced)
  expect(git(r.main, "rev-parse", "b1")).toBe(b1.sha)
})

test("main を含むブランチはそのまま重ね、main に入っている物は入っていたとする", () => {
  const r = repo()
  const base = git(r.main, "rev-parse", "HEAD")
  const b1 = r.branch("b1", "b1.txt", "1\n")
  const s = stack(r.queue, base, [b1, { name: "main", sha: base }], never)
  expect(s.tip).toBe(b1.sha)
  expect(s.already).toEqual([{ name: "main", sha: base }])
})

test("衝突したブランチは外し、ファイルを返し、取り込み専用の worktree はきれいなまま残りを重ねる", () => {
  const r = repo()
  const b1 = r.branch("b1", "a.txt", "one\n")
  const b2 = r.branch("b2", "a.txt", "two\n")
  const b3 = r.branch("b3", "c.txt", "3\n")
  const base = git(r.main, "rev-parse", "HEAD")
  const s = stack(r.queue, base, [b1, b2, b3], never)
  expect(s.conflicts).toEqual([{ ...b2, files: ["a.txt"] }])
  expect(s.onTip.map(c => c.name)).toEqual(["b1", "b3"])
  expect(git(r.queue, "status", "--porcelain")).toBe("")
  expect(git(r.queue, "rev-parse", "HEAD")).toBe(s.tip)
})

// main と b1 が GENERATED を変えた一時のリポジトリ。lines は各行の中身（行が違えば、きれいにマージできる）
function generatedOnBoth(mainLines: string[], branchLines: string[]) {
  const r = repo()
  r.commit(GENERATED.path, "x\n1\n2\n3\nz\n", "generated")
  const b1 = r.branch("b1", GENERATED.path, `${branchLines.join("\n")}\n`)
  const base = r.commit(GENERATED.path, `${mainLines.join("\n")}\n`, "main generated")
  return { r, b1, base }
}

test("衝突したのが GENERATED だけなら作り直して重ね、マージのコミットはいつもの形", () => {
  const { r, b1, base } = generatedOnBoth(["m", "1", "2", "3", "z"], ["b", "1", "2", "3", "z"])
  const f = fakeRegenerate(true)
  const s = stack(r.queue, base, [b1], f.regenerate)
  expect(f.calls).toEqual([r.queue])
  expect(s.onTip).toEqual([b1])
  expect(s.regenerated).toEqual([b1])
  expect(s.conflicts).toEqual([])
  expect(git(r.queue, "rev-parse", `${s.tip}^1`)).toBe(b1.sha)
  expect(git(r.queue, "rev-parse", `${s.tip}^2`)).toBe(base)
  expect(git(r.queue, "log", "-1", "--format=%B", s.tip)).toBe(`Merge main (${base.slice(0, 8)}) into b1`)
  expect(readFileSync(join(r.queue, GENERATED.path), "utf8")).toBe("rebuilt\n")
  expect(git(r.queue, "status", "--porcelain")).toBe("")
})

test("GENERATED とほかのファイルが衝突したら作り直さずに外す", () => {
  const r = repo()
  r.commit(GENERATED.path, "x\n", "generated")
  git(r.main, "checkout", "-q", "-b", "b1", "main")
  r.commit(GENERATED.path, "b\n", "b1 generated")
  const b1 = { name: "b1", sha: r.commit("a.txt", "b\n", "b1 a") }
  git(r.main, "checkout", "-q", "main")
  r.commit(GENERATED.path, "m\n", "main generated")
  const base = r.commit("a.txt", "m\n", "main a")
  const f = fakeRegenerate(true)
  const s = stack(r.queue, base, [b1], f.regenerate)
  expect(f.calls).toEqual([])
  expect(s.conflicts).toEqual([{ ...b1, files: ["a.txt", GENERATED.path] }])
  expect(s.tip).toBe(base)
})

test("作り直せなければ外してログを返し、取り込み専用の worktree はきれいなまま", () => {
  const { r, b1, base } = generatedOnBoth(["m", "1", "2", "3", "z"], ["b", "1", "2", "3", "z"])
  const s = stack(r.queue, base, [b1], fakeRegenerate(false).regenerate)
  expect(s.conflicts).toEqual([{ ...b1, files: [GENERATED.path], why: "/logs/regenerate.log" }])
  expect(s.onTip).toEqual([])
  expect(git(r.queue, "status", "--porcelain")).toBe("")
  expect(git(r.queue, "rev-parse", "HEAD")).toBe(base)
})

test("両側が GENERATED を変えてきれいにマージできても作り直し、片側だけなら作り直さない", () => {
  const { r, b1, base } = generatedOnBoth(["m", "1", "2", "3", "z"], ["x", "1", "2", "3", "b"])
  const f = fakeRegenerate(true)
  const s = stack(r.queue, base, [b1], f.regenerate)
  expect(f.calls).toEqual([r.queue])
  expect(s.regenerated).toEqual([b1])
  expect(git(r.queue, "show", `${s.tip}:${GENERATED.path}`)).toBe("rebuilt")
  expect(git(r.queue, "rev-list", "--count", `${b1.sha}..${s.tip}`)).toBe("2")
  expect(git(r.queue, "rev-parse", `${s.tip}^1`)).toBe(b1.sha)
  expect(git(r.queue, "log", "-1", "--format=%B", s.tip)).toBe(`Merge main (${base.slice(0, 8)}) into b1`)

  const b2 = r.branch("b2", "b2.txt", "2\n")
  const only = fakeRegenerate(true)
  expect(stack(r.queue, base, [b2], only.regenerate).regenerated).toEqual([])
  expect(only.calls).toEqual([])
})

test("main が重ねたあとに進んでいれば ff せず moved、追跡するファイルに未コミットがあれば dirty", () => {
  const r = repo()
  const b1 = r.branch("b1", "b1.txt", "1\n")
  const base = git(r.main, "rev-parse", "HEAD")
  const s = stack(r.queue, base, [b1], never)
  r.commit("m.txt", "m\n", "main moves")
  expect(fastForward(r.main, base, s.tip)).toBe("moved")

  const now = git(r.main, "rev-parse", "HEAD")
  const again = stack(r.queue, now, [b1], never)
  writeFileSync(join(r.main, "a.txt"), "edited\n")
  expect(fastForward(r.main, now, again.tip)).toBe("dirty")
  git(r.main, "checkout", "-q", "--", "a.txt")
  expect(fastForward(r.main, now, again.tip)).toBe("done")
  expect(git(r.main, "rev-parse", "HEAD")).toBe(again.tip)
})

test("bun test の出力から、落ちたテストとそのファイルを読む", () => {
  const out = [
    "bun test v1.4.4 (38afee6c8)",
    "",
    "test/a.test.ts:",
    "error: expect(received).toBe(expected)",
    "(fail) bad one [0.16ms]",
    "",
    "test/scripts/b.test.ts:",
    "(fail) grp > bad two [5012.00ms]",
    "",
    " 1 pass",
    " 2 fail",
  ].join("\n")
  expect(bunFailures(out)).toEqual([
    { step: "unit", where: "test/a.test.ts", title: "bad one" },
    { step: "unit", where: "test/scripts/b.test.ts", title: "grp > bad two" },
  ])
})

test("go test -json の出力から、落ちたテストを親のテストでまとめ、ビルドの失敗はテストの名前なしで読む", () => {
  const ev = (o: object) => JSON.stringify(o)
  const out = [
    ev({ Action: "run", Package: "m/internal/a", Test: "TestX" }),
    ev({ Action: "fail", Package: "m/internal/a", Test: "TestX/sub" }),
    ev({ Action: "fail", Package: "m/internal/a", Test: "TestX" }),
    ev({ Action: "fail", Package: "m/internal/a" }),
    ev({ Action: "fail", Package: "m/internal/b" }),
    "# m/internal/b",
  ].join("\n")
  expect(goFailures(out)).toEqual([
    { step: "go", where: "m/internal/a", title: "TestX" },
    { step: "go", where: "m/internal/b", title: "" },
  ])
})

test("playwright の json の報告から、落ちたテストをファイルと行で読む", () => {
  const report = {
    suites: [
      {
        title: "library.spec.ts",
        file: "library.spec.ts",
        specs: [{ title: "通る", file: "library.spec.ts", line: 10, tests: [{ status: "expected" }] }],
        suites: [
          {
            title: "書庫",
            file: "library.spec.ts",
            specs: [{ title: "並べ替え", file: "library.spec.ts", line: 220, tests: [{ status: "unexpected" }] }],
          },
        ],
      },
    ],
  }
  expect(playwrightFailures(JSON.stringify(report))).toEqual([
    { step: "e2e", where: "library.spec.ts:220", title: "書庫 > 並べ替え" },
  ])
  expect(playwrightFailures("")).toEqual([{ step: "e2e", where: "", title: "no report" }])
})

test("lint と typecheck は誤りの行を少しだけ返す", () => {
  const out = Array.from({ length: 9 }, (_, i) => `web/src/x.ts(${i},1): error TS2322: bad`).join("\n")
  expect(errorLines("typecheck", out)).toHaveLength(5)
})

test("変わったファイルから作り直す物を決める", () => {
  const embeds = new Set(["internal/engine/engine.js"])
  const none = { install: false, web: false, go: false, plugin: false }
  expect(rebuildsFor(["docs/concept.md", "test/x.test.ts"], embeds)).toEqual(none)
  expect(rebuildsFor(["web/src/core/stage.ts"], embeds)).toEqual({ ...none, web: true })
  expect(rebuildsFor(["internal/engine/engine.js"], embeds)).toEqual({ ...none, go: true })
  expect(rebuildsFor(["internal/server/hub.go"], embeds)).toEqual({ ...none, go: true })
  expect(rebuildsFor(["bun.lock"], embeds)).toEqual({ ...none, install: true, web: true })
  expect(rebuildsFor(["clients/claude-code/hooks/x.sh"], embeds)).toEqual({ ...none, plugin: true })
  expect(rebuildsFor(["web/dist/index.html"], embeds)).toEqual(none)
})

test("bun test の集計と読み取った落ちが合わないか、テストの外の誤りがあれば、全部を読み取れていない", () => {
  const one = [{ step: "unit", where: "test/b.test.ts", title: "bad" }]
  expect(bunComplete(" 1 pass\n 1 fail\n", one)).toBe(true)
  expect(bunComplete(" 2 fail\n 1 error\n", one)).toBe(false)
  expect(bunComplete(" 2 fail\n", one)).toBe(false)
})

// 流すたびに数を 1 つ足し、決まった回までは落ちる偽のステップ
function fakeStep(dir: string, failTimes: number, opts: { complete?: boolean; rerun?: boolean } = {}): Step {
  const counter = join(dir, "count")
  const script = `n=$(cat ${counter} 2>/dev/null || echo 0); n=$((n+1)); echo $n > ${counter}; [ $n -gt ${failTimes} ]`
  return {
    step: "fake",
    cmd: ["sh", "-c", script],
    failures: () => [{ step: "fake", where: "x", title: "t" }],
    complete: () => opts.complete ?? true,
    rerun: opts.rerun === false ? undefined : () => [["sh", "-c", script]],
  }
}

function tmp() {
  const d = mkdtempSync(join(tmpdir(), "merge-queue-step-"))
  dirs.push(d)
  return d
}

test("落ちたテストは流し直して通っても落ちとし、流し直しで通ったと返す", async () => {
  const d = tmp()
  const r = await runStep(fakeStep(d, 1), d, d)
  expect(r.ok).toBe(false)
  expect(r.rerun).toBe("passed")
  expect(r.failures).toEqual([{ step: "fake", where: "x", title: "t" }])
})

test("流し直してもまた落ちれば、流し直しても落ちたと返す", async () => {
  const d = tmp()
  const r = await runStep(fakeStep(d, 2), d, d)
  expect(r.ok).toBe(false)
  expect(r.rerun).toBe("failed")
})

test("流し直す手が無いか、落ちを全部は読み取れていなければ流し直さない", async () => {
  for (const opts of [{ rerun: false }, { complete: false }]) {
    const d = tmp()
    const r = await runStep(fakeStep(d, 1, opts), d, d)
    expect(r.ok).toBe(false)
  }
})

test("main を origin へ push し、origin の main が進む", () => {
  const { main, commit } = repo()
  const origin = join(dirname(main), "origin.git")
  execFileSync("git", ["init", "-q", "--bare", origin])
  git(main, "remote", "add", "origin", origin)
  const sha = commit("b.txt", "b\n", "b")
  expect(pushMain(main)).toEqual({ ok: true })
  expect(git(origin, "rev-parse", "refs/heads/main")).toBe(sha)
})

test("push できなければ理由の 1 行を返す", () => {
  const { main } = repo()
  git(main, "remote", "add", "origin", join(dirname(main), "missing.git"))
  const r = pushMain(main)
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.why).not.toBe("")
})

test("<ブランチ>:<sha> はその sha を、ブランチだけならブランチの先を入れる", () => {
  const { main } = repo()
  const first = git(main, "rev-parse", "HEAD")
  git(main, "branch", "feat")
  git(main, "commit", "-q", "--allow-empty", "-m", "more")
  git(main, "branch", "-f", "feat", "HEAD")
  expect(candidateOf(main, `feat:${first}`)).toEqual({ name: "feat", sha: first })
  expect(candidateOf(main, "feat")).toEqual({ name: "feat", sha: git(main, "rev-parse", "HEAD") })
})

test("落ちたブランチは重ねた main とログの置き場を添え、main の側の都合は落ちと分けて返す", () => {
  const lines = summary({
    outcomes: [
      {
        name: "a",
        sha: "a".repeat(40),
        kind: "failed",
        base: "b".repeat(40),
        logs: "/q/x",
        why: ["unit: t.test.ts t"],
      },
      { name: "c", sha: "c".repeat(40), kind: "main-side", why: "main の worktree に未コミット" },
    ],
    regenerated: [],
    flaky: [],
    rebuilt: [],
  })
  expect(lines).toEqual([
    "落ちた: a（main bbbbbbbb に重ねた。ログ /q/x）",
    "  unit: t.test.ts t",
    "main の側で止めた: c（main の worktree に未コミット）",
  ])
})

test("履歴の 1 行は時刻・ブランチ・sha・行き先・理由をタブで区切る", () => {
  const at = new Date("2026-01-02T03:04:05Z")
  const sha = "a".repeat(40)
  expect(historyLine({ name: "a", sha, kind: "merged" }, at)).toBe("2026-01-02T03:04:05.000Z\ta\taaaaaaaa\tmerged\t")
  const tail = (o: Parameters<typeof historyLine>[0]) => historyLine(o, at).split("\t").slice(3)
  expect(tail({ name: "a", sha, kind: "conflict", files: ["x.ts", "y.ts"] })).toEqual(["conflict", "x.ts y.ts"])
  expect(tail({ name: "a", sha, kind: "failed", base: sha, logs: "/l", why: ["unit: t", "go: u"] })).toEqual([
    "failed",
    "unit: t ログ /l",
  ])
})

const cand = (name: string): Candidate => ({ name, sha: name.repeat(40) })
const stackedOf = (onTip: Candidate[]): Stacked => ({ tip: "t", onTip, already: [], conflicts: [], regenerated: [] })
const failedOf = (onTip: Candidate[]): Attempt => ({
  kind: "failed",
  stacked: stackedOf(onTip),
  base: "b".repeat(40),
  logs: "/l",
  results: [
    {
      step: "unit",
      ok: false,
      failures: [{ step: "unit", where: "t.test.ts", title: "x" }],
      log: "/l/unit.log",
      rerun: "passed",
    },
  ],
})

test("重ねて落ちたら 1 件ずつ試し、落ちた物に重ねた main とログを付け、途中で main の側で止まれば残りも止めた物とする", async () => {
  const [a, b, c, d] = ["a", "b", "c", "d"].map(cand) as [Candidate, Candidate, Candidate, Candidate]
  const tries: Record<string, Attempt> = {
    a: { kind: "merged", stacked: stackedOf([a]) },
    b: failedOf([b]),
    c: { kind: "stopped", reason: "dirty", stacked: stackedOf([c]) },
  }
  const r = await collect(failedOf([a, b, c, d]), async x => tries[x.name] as Attempt)
  expect(r.outcomes.map(o => [o.name, o.kind])).toEqual([
    ["a", "merged"],
    ["b", "failed"],
    ["c", "main-side"],
    ["d", "main-side"],
  ])
  expect(r.outcomes[1]).toMatchObject({
    base: "b".repeat(40),
    logs: "/l",
    why: ["unit: t.test.ts x（流し直しで通った。揺れの疑い）"],
  })
  expect(r.outcomes[3]).toMatchObject({ why: "dirty" })
})

test("入ったか入っていた物だけで、push に失敗していなければ、うまくいった", () => {
  const base = { regenerated: [], flaky: [], rebuilt: [] }
  const merged = { ...cand("a"), kind: "merged" as const }
  expect(succeeded({ ...base, outcomes: [merged, { ...cand("b"), kind: "already" }] })).toBe(true)
  expect(succeeded({ ...base, outcomes: [merged], pushed: { ok: false, why: "x" } })).toBe(false)
  expect(succeeded({ ...base, outcomes: [{ ...cand("a"), kind: "main-side", why: "x" }] })).toBe(false)
})
