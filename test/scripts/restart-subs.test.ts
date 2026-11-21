import { expect, test } from "bun:test"
import {
  joinedSince,
  lastAssistantText,
  lastModel,
  NG_MARK,
  parseTarget,
  projectDir,
  READY_MARK,
  readiness,
  rejoinPrompt,
  wslPath,
} from "../../scripts/restart-subs"

test("サブの名前とモデルを読む", () => {
  expect(parseTarget("sub4")).toEqual({ workroom: "sub4_work" })
  expect(parseTarget("sub4_work")).toEqual({ workroom: "sub4_work" })
  expect(parseTarget("sub6:claude-fable-5-2")).toEqual({ workroom: "sub6_work", model: "claude-fable-5-2" })
  expect(parseTarget("main_manager")).toEqual({ workroom: "main_manager" })
})

test("Orca の WSL のパスを直す", () => {
  expect(wslPath("\\\\wsl.localhost\\Ubuntu-24.04\\home\\u\\feat-work4")).toBe("/home/u/feat-work4")
  expect(wslPath("/home/u/x")).toBe("/home/u/x")
})

test("会話の記録のフォルダは英数字以外を - にする", () => {
  expect(projectDir("/home/u/matomezu/平行作業用", "/h")).toBe("/h/.claude/projects/-home-u-matomezu------")
})

const line = (o: unknown) => JSON.stringify(o)
const assistant = (at: string, text: string, model = "claude-opus-5-5") =>
  line({ type: "assistant", timestamp: at, message: { model, content: [{ type: "text", text }] } })

test("最後のモデルと、時点より後の最後の返事", () => {
  const jsonl = [
    assistant("2026-11-19T00:00:00Z", "前", "claude-fable-5-2"),
    line({ type: "user", timestamp: "2026-11-19T00:01:00Z", message: { content: "準備して" } }),
    assistant("2026-11-19T00:02:00Z", `書いた\n${READY_MARK}`),
    line({
      type: "assistant",
      timestamp: "2026-11-19T00:03:00Z",
      message: { model: "<synthetic>", content: [{ type: "tool_use" }] },
    }),
    "壊れた行",
  ].join("\n")
  expect(lastModel(jsonl)).toBe("claude-opus-5-5")
  expect(lastAssistantText(jsonl, Date.parse("2026-11-19T00:01:00Z"))).toBe(`書いた\n${READY_MARK}`)
  expect(lastAssistantText(jsonl, Date.parse("2026-11-19T00:02:00Z"))).toBeUndefined()
})

test.each([
  [`済み\n${READY_MARK}`, "ready"],
  [`${NG_MARK}: 作業の途中`, "not-ready"],
  [`${READY_MARK}\nほかの事`, "not-ready"],
  [undefined, "no-answer"],
] as const)("準備の返事 %p は %p", (text, want) => {
  expect(readiness(text)).toBe(want)
})

test("join の頼みは、前もって承認した合言葉をそのまま使わせる", () => {
  expect(rejoinPrompt("sub4_work", "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed")).toBe(
    "sub4 の handoff よんで join（ワークルーム sub4_work、link は 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed をそのまま使う）",
  )
})

test("join が参加者 id を返したかは、時点より後の join の答えで見る", () => {
  const call = (at: string, id: string) =>
    JSON.stringify({
      type: "assistant",
      timestamp: at,
      message: { content: [{ type: "tool_use", id, name: "mcp__plugin_matomezu_matomezu__join", input: {} }] },
    })
  const result = (at: string, id: string, text: string) =>
    JSON.stringify({
      type: "user",
      timestamp: at,
      message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }] },
    })
  const since = Date.parse("2026-11-21T10:00:00Z")
  const old = [call("2026-11-21T09:00:00Z", "a"), result("2026-11-21T09:00:01Z", "a", '{"participant":"p1"}')]
  expect(joinedSince(old.join("\n"), since)).toBe(false)
  const requested = [call("2026-11-21T10:00:05Z", "b"), result("2026-11-21T10:00:06Z", "b", '{"requested":"r1"}')]
  expect(joinedSince([...old, ...requested].join("\n"), since)).toBe(false)
  const joined = [call("2026-11-21T10:00:05Z", "c"), result("2026-11-21T10:00:06Z", "c", '{"participant":"p2"}')]
  expect(joinedSince([...old, ...joined].join("\n"), since)).toBe(true)
})
