import { expect, test } from "bun:test"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { endActions } from "../../web/src/core/participant"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

// 参加者のセッションが終わったときに常駐が行うアクションは、アクションの定義が runsWhenAIEnds で名乗る。1 つのアクションだけが名乗る（2 つ目は E070）
test("参加者のセッションが終わったときのアクションは、参加者を外すアクションが名乗る", () => {
  expect(endActions(CORE_CATALOG)).toEqual({ leave: "@matomezu/base:participant-remove" })
})

test("終わったときの役を名乗るアクションが 2 つあれば E070", () => {
  const remove = BUILTIN_PARTS.actions.find(a => a.runsWhenAIEnds)
  if (!remove) throw new Error("no action names runsWhenAIEnds")
  const parts = {
    ...BUILTIN_PARTS,
    actions: [...BUILTIN_PARTS.actions, { ...remove, id: "@matomezu/base:participant-remove-twin" }],
  }
  let caught: { details?: readonly { code: string }[] } | undefined
  try {
    buildCoreCatalog(parts)
  } catch (e) {
    caught = e as { details?: readonly { code: string }[] }
  }
  expect(caught?.details?.map(d => d.code)).toContain("E070")
})
