import { expect, test } from "bun:test"
import { outcomeOf, recordsOfTranscriptLine } from "../../scripts/ask-log"

const q = {
  question: "どれにしますか？",
  header: "選ぶ",
  options: [{ label: "A (Recommended)" }, { label: "B" }, { label: "C" }],
}

test.each([
  ["推しを選んだ", q, "A (Recommended)", "recommended"],
  ["ほかの選択肢を選んだ", q, "B", "other-option"],
  ["選択肢に無い答えは自由記述", q, "どちらでもない", "free-text"],
  ["推しの無い問い", { ...q, options: [{ label: "A" }, { label: "B" }] }, "A", "no-recommendation"],
  ["複数選択で全部が選択肢", { ...q, multiSelect: true }, "A (Recommended), B", "other-option"],
  ["複数選択で推しだけ", { ...q, multiSelect: true }, "A (Recommended)", "recommended"],
] as const)("%s", (_, question, answer, outcome) => {
  expect(outcomeOf(question, answer)).toBe(outcome)
})

test("会話の記録の行から、答えのある問いだけを 1 行ずつ作る", () => {
  const line = JSON.stringify({
    timestamp: "2026-11-21T10:00:00Z",
    cwd: "/w/feat-work2",
    message: { content: [{ type: "tool_result", tool_use_id: "toolu_1" }] },
    toolUseResult: {
      questions: [q, { ...q, question: "答えの無い問い" }],
      answers: { [q.question]: "B" },
      annotations: { [q.question]: { notes: "理由" } },
    },
  })
  expect(recordsOfTranscriptLine(line)).toEqual([
    {
      id: "toolu_1#0",
      at: "2026-11-21T10:00:00Z",
      worktree: "feat-work2",
      header: "選ぶ",
      question: q.question,
      recommended: "A (Recommended)",
      answer: "B",
      outcome: "other-option",
      notes: "理由",
    },
  ])
})

test("AskUserQuestion の結果でない行は何も作らない", () => {
  expect(recordsOfTranscriptLine(JSON.stringify({ toolUseResult: { answers: {} } }))).toEqual([])
  expect(recordsOfTranscriptLine("not json")).toEqual([])
})
