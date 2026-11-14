import { expect, test } from "bun:test"
import { parseReply } from "../../scripts/relay-log/reply"

test("SSE の返答を、テキストと tool_use のブロックに組み直す", () => {
  const ev = (o: unknown) => `event: x\ndata: ${JSON.stringify(o)}\n\n`
  const sse =
    ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
    ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "検索" } }) +
    ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "します" } }) +
    ev({ type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "mcp__matomezu__search" } }) +
    ev({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"q":' } }) +
    ev({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"a"}' } })
  expect(parseReply(sse)).toEqual([
    { type: "text", text: "検索します" },
    { type: "tool_use", name: "mcp__matomezu__search", input: '{"q":"a"}' },
  ])
})

test("JSON の返答も読み、壊れた本文は空にする", () => {
  const body = JSON.stringify({
    content: [
      { type: "text", text: "hi" },
      { type: "tool_use", name: "t", input: { a: 1 } },
    ],
  })
  expect(parseReply(body)).toEqual([
    { type: "text", text: "hi" },
    { type: "tool_use", name: "t", input: '{"a":1}' },
  ])
  expect(parseReply("{broken")).toEqual([])
})
