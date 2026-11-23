import { expect, test } from "bun:test"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { HOST_ROLES } from "../../web/src/core/hosts"
import { BUILTIN_PARTS } from "../support"

// ほかのホストに応じて常駐が行うアクション（runsBetweenHosts）は、役ごとに 1 つのアクションだけが名乗り（2 つ目は E081）、利用者だけが行うアクションに限る（でなければ E082）
const codesOf = (parts: typeof BUILTIN_PARTS): string[] => {
  try {
    buildCoreCatalog(parts)
  } catch (e) {
    return ((e as { details?: readonly { code: string }[] }).details ?? []).map(d => d.code)
  }
  return []
}

test.each(HOST_ROLES)("役 %s を名乗るアクションが 2 つあれば E081", role => {
  const named = BUILTIN_PARTS.actions.find(a => a.runsBetweenHosts === role)
  if (!named) throw new Error(`no action names ${role}`)
  const parts = { ...BUILTIN_PARTS, actions: [...BUILTIN_PARTS.actions, { ...named, id: `${named.id}-twin` }] }
  expect(codesOf(parts)).toContain("E081")
})

test("利用者だけが行うアクションでなければ E082", () => {
  const actions = BUILTIN_PARTS.actions.map(a =>
    a.runsBetweenHosts === "add-paired-host" ? { ...a, userOnly: undefined } : a,
  )
  expect(codesOf({ ...BUILTIN_PARTS, actions })).toContain("E082")
})
