// 画面の場所に入れるプラグイン状態の宣言（定義は core/def/plugin-state.ts、置き場と読み戻しは store/plugin-state.ts）:
// 宣言した値だけを置いて場所に入れ、場所から戻すときは宣言の形で読んで丸ごと置き換える
import { expect, test } from "bun:test"
import { z } from "zod"
import { stagePlacesOf, withStagePlaces } from "../../web/src/core/address"
import type { PluginStateDef } from "../../web/src/core/def/plugin-state"
import type { MatomezuError } from "../../web/src/core/errors"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { screenOf } from "../../web/src/core/window"
import { BUILTIN } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { readPlaced, withPluginState } from "../../web/src/store/plugin-state"
import { SAMPLE_BOOKS } from "../sample-books"

const kit = pluginKit("k", defineMessages({}))
const TAB = kit.definePluginState({ id: "tab", scope: "window", schema: z.enum(["one", "two"]), address: "push" })
const MODE = kit.definePluginState({ id: "mode", scope: "stage", schema: z.string(), address: "replace" })

const NOTE = kit.definePluginStateOf<string>()({ id: "note", scope: "window" })
const PICK = kit.definePluginStateOf<number>()({ id: "pick", scope: "stage" })

const make = () =>
  createMatomezu({
    plugins: [...BUILTIN, kit.plugin({ pluginStates: [TAB, MODE, NOTE, PICK] })],
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
  expect(instance.catalog.store.pluginStates.get("k:mode")?.scope).toBe("stage")
  expect(() =>
    createMatomezu({ plugins: [...BUILTIN, kit.plugin({ pluginStates: [TAB, TAB] })], partial: true }),
  ).toThrow("E001")
})

test("値を置くと画面の場所に入る。形に合わない値は E123、知らない id は E122、範囲が違えば E124。ステージの宣言は無いステージに置かない", () => {
  const instance = make()
  instance.setPluginState("k:tab", null, "two")
  instance.setPluginState("k:mode", "s1", "wide")
  instance.setPluginState("k:mode", "s9", "wide")
  const address = instance.address()
  expect(address.window).toEqual({ "k:tab": "two" })
  expect(stagePlacesOf(address)[0]?.states).toEqual({ "k:mode": "wide" })
  expect(code(() => instance.setPluginState("k:tab", null, "three"))).toBe("E123")
  expect(code(() => instance.setPluginState("k:nope", null, 1))).toBe("E122")
  expect(code(() => instance.setPluginState("k:tab", "s1", "one"))).toBe("E124")
  expect(code(() => instance.setPluginState("k:mode", null, "x"))).toBe("E124")
  // undefined なら消す
  instance.setPluginState("k:tab", null, undefined)
  expect(instance.address().window).toEqual({})
})

test("場所を当てはめると、宣言した値を丸ごと置き換える。形に合わない値と宣言の無い id は落ちる", () => {
  const instance = make()
  instance.setPluginState("k:mode", "s1", "old")
  const at = instance.address()
  instance.locate({
    ...withStagePlaces(at, [{ ...stagePlacesOf(at)[0]!, states: { "k:tab": "two" } }]),
    window: { "k:tab": "one", "k:nope": 1 },
  })
  // ステージの場所の k:tab はステージに結ばない宣言なので落ち、k:mode は場所に無いので消える
  expect(instance.address().window).toEqual({ "k:tab": "one" })
  expect(stagePlacesOf(instance.address())[0]?.states).toEqual({})
  instance.locate({ ...at, window: { "k:tab": "three" } })
  expect(instance.address().window).toEqual({})
})

test("ステージを閉じると、そのステージの値は消える", () => {
  const instance = make()
  instance.actions.split("s1")
  const right = screenOf(instance.state.getState().window).stages[1]!.id
  instance.setPluginState("k:mode", right, "right")
  expect(instance.state.getState().pluginValues.stages[right]).toEqual({ "k:mode": "right" })
  instance.actions.closeStage(right)
  expect(instance.state.getState().pluginValues.stages[right]).toBeUndefined()
})

test("readPlaced は範囲の合う宣言の値だけを読み、withPluginState は id の値を替える（undefined なら消す）", () => {
  const defs = new Map<string, PluginStateDef>([
    [TAB.id, TAB],
    [MODE.id, MODE],
  ])
  expect(readPlaced(defs, "window", { "k:tab": "two", "k:mode": "x" })).toEqual({ "k:tab": "two" })
  expect(readPlaced(defs, "stage", { "k:mode": 5 })).toEqual({})
  expect(readPlaced(defs, "window", undefined)).toEqual({})
  expect(withPluginState({ a: 1 }, "b", 2)).toEqual({ a: 1, b: 2 })
  expect(withPluginState({ a: 1 }, "a", undefined)).toEqual({})
})

test("コントロールセンターの前に出す画面の宣言は、スクリーン 1 枚ごとの値で、変えるたびにブラウザの履歴に積む。スクリーンを閉じると値も消える", () => {
  const instance = createMatomezu({
    plugins: BUILTIN,
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  const id = "@matomezu/control-center:front-screen"
  expect(instance.catalog.store.pluginStates.get(id)).toMatchObject({ scope: "screen", address: "push" })
  expect(instance.pushing().has(id)).toBe(true)
  const center = instance.state.getState().window.screens.find(s => s.def === "@matomezu/control-center:screen")!.id
  instance.setPluginState(id, center, "library")
  expect(instance.address().screens.find(s => s.id === center)?.states).toEqual({ [id]: "library" })
  expect(code(() => instance.setPluginState(id, center, "participants"))).toBe("E123")
  expect(code(() => instance.setPluginState(id, null, "library"))).toBe("E124")
  // 開いていないスクリーンには置かない。2 枚目に置いた値は、そのスクリーンを閉じると消える
  instance.setPluginState(id, "c99", "library")
  expect(instance.state.getState().pluginValues.screens.c99).toBeUndefined()
  const second = instance.actions.openScreen("@matomezu/control-center:screen", {})
  instance.setPluginState(id, second, "library")
  expect(instance.state.getState().pluginValues.screens[second]).toEqual({ [id]: "library" })
  instance.actions.closeScreen(second)
  expect(instance.state.getState().pluginValues.screens[second]).toBeUndefined()
  // 場所を当てはめると、スクリーンごとの値も戻る
  const at = instance.address()
  instance.setPluginState(id, center, "projects")
  instance.locate(at)
  expect(instance.state.getState().pluginValues.screens[center]).toEqual({ [id]: "library" })
})

test("画面の場所に入れない宣言（none）の値は、画面の場所に出ず、場所から来ても読まず、場所を当てはめても（戻る・進むでも）残る", () => {
  const instance = make()
  instance.setPluginState("k:note", null, "hello")
  instance.setPluginState("k:pick", "s1", 3)
  instance.setPluginState("k:tab", null, "two")
  const at = instance.address()
  // 場所には入れる宣言の値だけが出る
  expect(at.window).toEqual({ "k:tab": "two" })
  expect(stagePlacesOf(at)[0]?.states).toEqual({})
  // 場所を当てはめると入れる宣言の値は置き換わり、入れない宣言の値は残る
  instance.locate({ ...at, window: {} })
  expect(instance.state.getState().pluginValues.window).toEqual({ "k:note": "hello" })
  expect(instance.state.getState().pluginValues.stages.s1).toEqual({ "k:pick": 3 })
  // URL に書かれた入れない宣言の id は読まない（手で書いた URL で状態を作らせない）
  instance.locate({
    ...withStagePlaces(at, [{ ...stagePlacesOf(at)[0]!, states: { "k:pick": 9 } }]),
    window: { "k:note": "forged" },
  })
  expect(instance.state.getState().pluginValues.window).toEqual({ "k:note": "hello" })
  expect(instance.state.getState().pluginValues.stages.s1).toEqual({ "k:pick": 3 })
})

test("入れない宣言（none）は形を確かめず、同じ値なら置き直さない。入れる宣言の形は書くたびに確かめる", () => {
  const instance = make()
  instance.setPluginState("k:note", null, "a")
  const first = instance.state.getState().pluginValues
  instance.setPluginState("k:note", null, "a")
  expect(instance.state.getState().pluginValues).toBe(first)
  expect(code(() => instance.setPluginState("k:tab", null, "three"))).toBe("E123")
})

test("ほかのプラグインの宣言に、id と値だけで入れる道: address を持つ宣言にだけ、宣言の形で確かめて入れる。宣言の無い id・address の無い宣言・形に合わない値・場所の無い範囲は落ちる。同じ値は積まない", () => {
  const instance = make()
  const caller = { screen: screenOf(instance.state.getState().window).current }
  const at = () => instance.address().window
  expect(instance.setPluginStateById("k:tab", "two", caller)).toBe(true)
  expect(at()).toEqual({ "k:tab": "two" })
  // 宣言の無い id・address の無い宣言・形に合わない値は、何もせず落ちる（error にしない）
  expect(instance.setPluginStateById("k:nope", "two", caller)).toBe(false)
  expect(instance.setPluginStateById("k:note", "x", caller)).toBe(false)
  expect(instance.state.getState().pluginValues.window["k:note"]).toBeUndefined()
  expect(instance.setPluginStateById("k:tab", "three", caller)).toBe(false)
  expect(at()).toEqual({ "k:tab": "two" })
  // ステージの宣言は caller のステージの値。ステージを渡さない・無いステージには入れない
  expect(instance.setPluginStateById("k:mode", "wide", caller)).toBe(false)
  expect(instance.setPluginStateById("k:mode", "wide", { ...caller, stage: "s9" })).toBe(false)
  expect(instance.setPluginStateById("k:mode", "wide", { ...caller, stage: "s1" })).toBe(true)
  expect(stagePlacesOf(instance.address())[0]?.states).toEqual({ "k:mode": "wide" })
  // スクリーンの宣言は、呼んだスクリーンの値。開いていないスクリーンには入れず、同じ値は state を作り直さない
  const id = "@matomezu/control-center:front-screen"
  const center = instance.state.getState().window.screens.find(s => s.def === "@matomezu/control-center:screen")!.id
  expect(instance.setPluginStateById(id, "library", { screen: center })).toBe(true)
  expect(instance.address().screens.find(s => s.id === center)?.states).toEqual({ [id]: "library" })
  expect(instance.setPluginStateById(id, "library", { screen: "c99" })).toBe(false)
  // 書き先は定義の id で渡す。渡した定義のスクリーンに入る（別のスクリーンには入らない）。窓のカレントには落とさず、開いていない定義・screenDef もスクリーンも無ければ false
  const centerDef = "@matomezu/control-center:screen"
  const book = instance.state.getState().window.screens.find(s => s.def !== centerDef)!.id
  const states = (sid: string) => instance.state.getState().pluginValues.screens[sid]?.[id]
  expect(instance.setPluginStateById(id, "projects", { screenDef: centerDef })).toBe(true)
  expect(states(center)).toBe("projects")
  expect(states(book)).toBeUndefined()
  expect(instance.setPluginStateById(id, "projects", { screenDef: "@matomezu/base:nope" })).toBe(false)
  expect(instance.setPluginStateById(id, "projects", {})).toBe(false)
  expect(instance.setPluginStateById(id, "participants", { screen: center })).toBe(false)
  const before = instance.state.getState().pluginValues
  expect(instance.setPluginStateById(id, "projects", { screen: center })).toBe(true)
  expect(instance.state.getState().pluginValues).toBe(before)
})
