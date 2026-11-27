import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  nextStep,
  queuedRequests,
  type Request,
  refusal,
  requestsDir,
  type Situation,
} from "../../scripts/merge-request"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const sha = "a".repeat(40)
const ready: Situation = { branch: "feat/x", changes: "", hasMain: true, inMain: false, sha, queued: [] }
const req = (over: Partial<Request> = {}): Request => ({
  branch: "feat/y",
  sha: "b".repeat(40),
  worktree: "/w/y",
  pid: 1,
  at: "2026-01-01T00:00:00Z",
  ...over,
})

test("未コミット・main の未取り込み・main 自身・main に入った sha・同じ sha が並んでいるときは並べない", () => {
  expect(refusal(ready)).toBeUndefined()
  expect(refusal({ ...ready, branch: undefined })).toBe("ブランチを checkout していない")
  expect(refusal({ ...ready, branch: "main" })).toBe("main 自身は並べない")
  expect(refusal({ ...ready, changes: " M a.ts" })).toBe("未コミットの変更がある:\n M a.ts")
  expect(refusal({ ...ready, inMain: true })).toBe("この sha は main に入っている")
  expect(refusal({ ...ready, hasMain: false })).toBe("main の最新を取り込んでいない")
  expect(refusal({ ...ready, queued: [req({ sha, worktree: "/w/z" })] })).toBe("同じ sha が並んでいる（/w/z）")
  expect(refusal({ ...ready, queued: [req()] })).toBeUndefined()
})

test("並んでいる印を読み、プロセスの無い印と読めない印は消す", () => {
  const common = mkdtempSync(join(tmpdir(), "merge-request-"))
  dirs.push(common)
  const dir = requestsDir(common)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "1.json"), JSON.stringify(req({ pid: 1 })))
  writeFileSync(join(dir, "2.json"), JSON.stringify(req({ pid: 2 })))
  writeFileSync(join(dir, "3.json"), "{")
  writeFileSync(join(dir, "1.log"), "")
  expect(queuedRequests(common, pid => pid === 1).map(r => r.pid)).toEqual([1])
  expect(existsSync(join(dir, "2.json"))).toBe(false)
  expect(existsSync(join(dir, "3.json"))).toBe(false)
  expect(existsSync(join(dir, "1.log"))).toBe(true)
})

test("外された物には、重ねた main を添えて次にする事を返し、入った物には返さない", () => {
  expect(nextStep({ name: "x", sha, kind: "failed", base: "c".repeat(40), logs: "/l", why: [] })).toStartWith(
    "次: main cccccccc を取り込み、落ちたテストだけ流す。",
  )
  expect(nextStep({ name: "x", sha, kind: "conflict", files: ["a"] })).toBe("次: main を取り込んで衝突を解き、並び直す")
  expect(nextStep({ name: "x", sha, kind: "main-side", why: "dirty" })).toBe(
    "次: main の側の都合なので、main_manager に知らせる",
  )
  expect(nextStep({ name: "x", sha, kind: "merged" })).toBeUndefined()
})
