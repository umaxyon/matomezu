// 場所に入れる画面の状態の宣言（定義は core/def/placed-state.ts、置き場と読み戻しは store/placed-state.ts）:
// 宣言した値だけを置いて場所に入れ、場所から戻すときは宣言の形で読んで丸ごと置き換える
import { expect, test } from "bun:test"
import { z } from "zod"
import type { PlacedStateDef } from "../../web/src/core/def/placed-state"
import type { MatomezuError } from "../../web/src/core/errors"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { BUILTIN } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { readPlaced, withPlaced } from "../../web/src/store/placed-state"
import { SAMPLE_BOOKS } from "../sample-books"

const kit = pluginKit("k", defineMessages({}))
const TAB = kit.definePlacedState({ id: "tab", scope: "frame", schema: z.enum(["one", "two"]), browserHistory: "push" })
const MODE = kit.definePlacedState({ id: "mode", scope: "stage", schema: z.string(), browserHistory: "replace" })

const make = () =>
  createMatomezu({
    plugins: [...BUILTIN, kit.plugin({ placedStates: [TAB, MODE] })],
    controlCenter: "@matomezu/control-center:control-center",
    books: SAMPLE_BOOKS,
    lang: "ja",
    partial: true,
  })

const code = (run: () => void): string | undefined => {
  try {
    run()
  } catch (e) {
    return (e as MatomezuError).code
  }
  return undefined
}

test("宣言は id を持ち、kit が頭を付ける。積むと宣言した宣言の id の組を台帳から引ける。同じ id は error", () => {
  expect(TAB.id).toBe("k:tab")
  const instance = make()
  expect(instance.pushing().has("k:tab")).toBe(true)
  expect(instance.pushing().has("k:mode")).toBe(false)
  expect(instance.catalog.store.placedStates.get("k:mode")?.scope).toBe("stage")
  expect(() =>
    createMatomezu({ plugins: [...BUILTIN, kit.plugin({ placedStates: [TAB, TAB] })], partial: true }),
  ).toThrow("E001")
})

test("値を置くと画面の場所に入る。形に合わない値は E123、知らない id は E122、範囲が違えば E124。ステージの宣言は無いステージに置かない", () => {
  const instance = make()
  instance.setPlaced("k:tab", null, "two")
  instance.setPlaced("k:mode", "s1", "wide")
  instance.setPlaced("k:mode", "s9", "wide")
  const address = instance.address()
  expect(address.frame).toEqual({ "k:tab": "two" })
  expect(address.stages[0]?.states).toEqual({ "k:mode": "wide" })
  expect(code(() => instance.setPlaced("k:tab", null, "three"))).toBe("E123")
  expect(code(() => instance.setPlaced("k:nope", null, 1))).toBe("E122")
  expect(code(() => instance.setPlaced("k:tab", "s1", "one"))).toBe("E124")
  expect(code(() => instance.setPlaced("k:mode", null, "x"))).toBe("E124")
  // undefined なら消す
  instance.setPlaced("k:tab", null, undefined)
  expect(instance.address().frame).toEqual({})
})

test("場所を当てはめると、宣言した値を丸ごと置き換える。形に合わない値と宣言の無い id は落ちる", () => {
  const instance = make()
  instance.setPlaced("k:mode", "s1", "old")
  const at = instance.address()
  instance.locate({
    ...at,
    frame: { "k:tab": "one", "k:nope": 1 },
    stages: [{ ...at.stages[0]!, states: { "k:tab": "two" } }],
  })
  // ステージの場所の k:tab は窓の外の宣言なので落ち、k:mode は場所に無いので消える
  expect(instance.address().frame).toEqual({ "k:tab": "one" })
  expect(instance.address().stages[0]?.states).toEqual({})
  instance.locate({ ...at, frame: { "k:tab": "three" } })
  expect(instance.address().frame).toEqual({})
})

test("ステージを閉じると、そのステージの値は消える", () => {
  const instance = make()
  instance.actions.split("s1")
  const right = instance.state.getState().window.screens[0]!.stages[1]!.id
  instance.setPlaced("k:mode", right, "right")
  expect(instance.state.getState().placedValues.stages[right]).toEqual({ "k:mode": "right" })
  instance.actions.closeStage(right)
  expect(instance.state.getState().placedValues.stages[right]).toBeUndefined()
})

test("readPlaced は範囲の合う宣言の値だけを読み、withPlaced は id の値を替える（undefined なら消す）", () => {
  const defs = new Map<string, PlacedStateDef>([
    [TAB.id, TAB],
    [MODE.id, MODE],
  ])
  expect(readPlaced(defs, "frame", { "k:tab": "two", "k:mode": "x" })).toEqual({ "k:tab": "two" })
  expect(readPlaced(defs, "stage", { "k:mode": 5 })).toEqual({})
  expect(readPlaced(defs, "frame", undefined)).toEqual({})
  expect(withPlaced({ a: 1 }, "b", 2)).toEqual({ a: 1, b: 2 })
  expect(withPlaced({ a: 1 }, "a", undefined)).toEqual({})
})

test("コントロールセンターの前に出す画面の宣言は、窓の外の値で、変えるたびにブラウザの履歴に積む", () => {
  const instance = createMatomezu({
    plugins: BUILTIN,
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  const id = "@matomezu/control-center:front-screen"
  expect(instance.catalog.store.placedStates.get(id)).toMatchObject({ scope: "frame", browserHistory: "push" })
  expect(instance.pushing().has(id)).toBe(true)
  instance.setPlaced(id, null, "library")
  expect(instance.address().frame).toEqual({ [id]: "library" })
  expect(code(() => instance.setPlaced(id, null, "participants"))).toBe("E123")
})
