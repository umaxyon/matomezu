// レシーバー（アクションの receives）: レコードが対象のアクションだけが名乗れ（でなければ E135）、届いた 1 通からはレシーバーだけを行う
import { expect, test } from "bun:test"
import { z } from "zod"
import { AI } from "../../web/src/core/actor"
import { performBulk } from "../../web/src/core/bulk"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { defineAction } from "../../web/src/core/def/action"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { worldOf } from "../../web/src/store/world"
import { BUILTIN_PARTS, CORE_CATALOG, newStore } from "../support"

const PLAIN = defineAction({
  id: "t:plain",
  title: "@matomezu/base:Move to trash",
  aiDescription: "Change nothing.",
  target: "library",
  permissionScope: "unknown",
  args: z.strictObject({}),
  run: library => ({ next: library, result: {} }),
})

const codesOf = (parts: typeof BUILTIN_PARTS): string[] => {
  try {
    buildCoreCatalog(parts)
  } catch (e) {
    return ((e as { details?: readonly { code: string }[] }).details ?? []).map(d => d.code)
  }
  return []
}

test("書庫が対象のアクションが receives を名乗れば E135", () => {
  const receiving = { ...PLAIN, receives: "messages" } as never
  expect(codesOf({ ...BUILTIN_PARTS, actions: [...BUILTIN_PARTS.actions, receiving] })).toContain("E135")
})

test("届いた 1 通から、レシーバーでないアクションを行えば断る", () => {
  const center = CORE_CATALOG.controlCenters.get(BUILTIN_CONTROL_CENTER)!
  const catalog = buildCoreCatalog({
    ...BUILTIN_PARTS,
    actions: [...BUILTIN_PARTS.actions, PLAIN],
    controlCenters: [{ ...center, actions: [...center.actions, PLAIN.id] as never }],
  })
  const step = { action: PLAIN.id, args: {}, newId: () => "n", now: "2026-11-28T00:00:00.000Z", today: "2026-11-28" }
  const ctx = { catalog, controlCenter: BUILTIN_CONTROL_CENTER, lang: "ja" as const, actor: AI }
  const world = worldOf(newStore().state.getState())
  expect(performBulk(world, [step], ctx)).toMatchObject({ ok: true })
  const received = { envelope: "e1", from: { kind: "user" as const } }
  expect(performBulk(world, [step], { ...ctx, received })).toMatchObject({
    ok: false,
    detail: "t:plain is not an action that receives payloads",
  })
})
