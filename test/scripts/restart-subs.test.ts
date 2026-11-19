import { expect, test } from "bun:test"
import {
  lastAssistantText,
  lastModel,
  NG_MARK,
  parseTarget,
  projectDir,
  READY_MARK,
  readiness,
  wslPath,
} from "../../scripts/restart-subs"

test("サブの名前とモデルを読む", () => {
  expect(parseTarget("sub4")).toEqual({ workroom: "sub4_work" })
  expect(parseTarget("sub4_work")).toEqual({ workroom: "sub4_work" })
  expect(parseTarget("sub6:claude-fable-5-2")).toEqual({ workroom: "sub6_work", model: "claude-fable-5-2" })
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
