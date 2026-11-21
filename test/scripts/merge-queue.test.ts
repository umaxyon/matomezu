import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  bunComplete,
  bunFailures,
  errorLines,
  fastForward,
  git,
  goFailures,
  playwrightFailures,
  rebuildsFor,
  runStep,
  type Step,
  stack,
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

test("ブランチに main を取り込み、マージのコミットのはじめの親はブランチ。ブランチの ref は動かない", () => {
  const r = repo()
  const b1 = r.branch("b1", "b1.txt", "1\n")
  const advanced = r.commit("m.txt", "m\n", "main moves")
  const s = stack(r.queue, advanced, [b1])
  expect(s.onTip).toEqual([b1])
  expect(git(r.queue, "rev-parse", `${s.tip}^1`)).toBe(b1.sha)
  expect(git(r.queue, "rev-parse", `${s.tip}^2`)).toBe(advanced)
  expect(git(r.main, "rev-parse", "b1")).toBe(b1.sha)
})

test("main を含むブランチはそのまま重ね、main に入っている物は入っていたとする", () => {
  const r = repo()
  const base = git(r.main, "rev-parse", "HEAD")
  const b1 = r.branch("b1", "b1.txt", "1\n")
  const s = stack(r.queue, base, [b1, { name: "main", sha: base }])
  expect(s.tip).toBe(b1.sha)
  expect(s.already).toEqual([{ name: "main", sha: base }])
})

test("衝突したブランチは外し、ファイルを返し、取り込み専用の worktree はきれいなまま残りを重ねる", () => {
  const r = repo()
  const b1 = r.branch("b1", "a.txt", "one\n")
  const b2 = r.branch("b2", "a.txt", "two\n")
  const b3 = r.branch("b3", "c.txt", "3\n")
  const base = git(r.main, "rev-parse", "HEAD")
  const s = stack(r.queue, base, [b1, b2, b3])
  expect(s.conflicts).toEqual([{ name: "b2", files: ["a.txt"] }])
  expect(s.onTip.map(c => c.name)).toEqual(["b1", "b3"])
  expect(git(r.queue, "status", "--porcelain")).toBe("")
  expect(git(r.queue, "rev-parse", "HEAD")).toBe(s.tip)
})

test("main が重ねたあとに進んでいれば ff せず moved、追跡するファイルに未コミットがあれば dirty", () => {
  const r = repo()
  const b1 = r.branch("b1", "b1.txt", "1\n")
  const base = git(r.main, "rev-parse", "HEAD")
  const s = stack(r.queue, base, [b1])
  r.commit("m.txt", "m\n", "main moves")
  expect(fastForward(r.main, base, s.tip)).toBe("moved")

  const now = git(r.main, "rev-parse", "HEAD")
  const again = stack(r.queue, now, [b1])
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

test("落ちたテストを流し直して通れば、通しにして揺れたとする", async () => {
  const d = tmp()
  const r = await runStep(fakeStep(d, 1), d, d)
  expect(r.ok).toBe(true)
  expect(r.flaky).toEqual([{ step: "fake", where: "x", title: "t" }])
})

test("流し直してもまた落ちれば落ちとする", async () => {
  const d = tmp()
  const r = await runStep(fakeStep(d, 2), d, d)
  expect(r.ok).toBe(false)
  expect(r.flaky).toEqual([])
})

test("流し直す手が無いか、落ちを全部は読み取れていなければ流し直さない", async () => {
  for (const opts of [{ rerun: false }, { complete: false }]) {
    const d = tmp()
    const r = await runStep(fakeStep(d, 1, opts), d, d)
    expect(r.ok).toBe(false)
  }
})
