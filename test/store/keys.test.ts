import { expect, test } from "bun:test"
import { isMatomezuError } from "../../web/src/core/errors"
import { NO_KEY_CHANGES } from "../../web/src/core/keys"
import { BUILTIN } from "../../web/src/plugins"
import { defineCommand } from "../../web/src/store/commands/def"
import { createMatomezu } from "../../web/src/store/create"
import { type DefaultKey, inspectKey, keyScopes, keysOf, keyTable, shadowedKeys } from "../../web/src/store/keys"
import { definePlugin } from "../../web/src/store/plugin"
import { newStore } from "../support"

const def = (key: string, command: string, plugin: string, builtin = false, scope = "stage"): DefaultKey => ({
  binding: { key, command, scope },
  plugin,
  builtin,
})

test("勝つ順は 利用者 > 中の部品 > 外のプラグイン。外の既定は中とぶつかれば使わず、外どうしでぶつかればどちらも使わない", () => {
  const defaults = [
    def("Delete", "paper.delete", "@matomezu/paper", true),
    def("Delete", "a/del", "a"),
    def("D", "a/dup", "a"),
    def("D", "b/dup", "b"),
    def("E", "b/edit", "b"),
  ]
  const table = keyTable(defaults, NO_KEY_CHANGES)
  expect(table.active.map(e => e.binding.command)).toEqual(["paper.delete", "b/edit"])
  expect(table.dropped.map(d => [d.entry.binding.command, d.reason])).toEqual([
    ["a/del", "builtin"],
    ["a/dup", "plugins"],
    ["b/dup", "plugins"],
  ])
  // 利用者が足した行は中の部品に勝ち、後に足したものが先
  const user = keyTable(defaults, {
    added: [
      { key: "Delete", command: "x/one", scope: "stage" },
      { key: "Delete", command: "x/two", scope: "stage" },
    ],
    removed: [],
  })
  expect(inspectKey(user, { scope: "stage", key: "Delete" })).toMatchObject({
    value: "x/two",
    decidedBy: { source: "key", from: "user" },
  })
  expect(inspectKey(user, { scope: "stage", key: "Delete" }).steps.map(s => [s.value, s.from])).toEqual([
    ["x/two", expect.objectContaining({ from: "user" })],
    ["x/one", expect.objectContaining({ from: "user" })],
    ["paper.delete", expect.objectContaining({ from: "builtin" })],
    [null, expect.objectContaining({ from: "plugin", plugin: "a", dropped: "builtin" })],
  ])
})

test("キーを変えるのは、既定の行を外して新しい行を足す。当たる先の無い変更は残すが効かない", () => {
  const defaults = [def("Delete", "paper.delete", "@matomezu/paper", true)]
  const table = keyTable(defaults, {
    added: [
      { key: "Mod+Backspace", command: "paper.delete", scope: "stage" },
      { key: "X", command: "gone/command", scope: "stage" },
    ],
    removed: [
      { key: "Delete", command: "paper.delete", scope: "stage" },
      { key: "Q", command: "gone/other", scope: "stage" },
    ],
  })
  expect(keysOf(table, "paper.delete").map(e => e.binding.key)).toEqual(["Mod+Backspace"])
  expect(table.dropped).toMatchObject([{ reason: "removed", entry: { binding: { key: "Delete" } } }])
})

test("範囲は狭いものから引き、メニューとダイアログが開いている間はほかを見ない。アプリ全体の行がステージで隠れるかを返す", () => {
  expect(keyScopes({ menu: false, dialog: false }, ["a/panel"])).toEqual(["a/panel", "stage", "app"])
  expect(keyScopes({ menu: false, dialog: true })).toEqual(["dialog"])
  expect(keyScopes({ menu: true, dialog: true })).toEqual(["menu"])
  const table = keyTable(
    [def("D", "app/thing", "@matomezu/base", true, "app"), def("D", "paper.delete", "@matomezu/paper", true)],
    NO_KEY_CHANGES,
  )
  expect(shadowedKeys(table)).toMatchObject([
    { entry: { binding: { command: "app/thing" } }, by: { binding: { command: "paper.delete" } } },
  ])
})

test("押したキーは、当たった範囲のコマンドを行い、押せないコマンドなら外の範囲へは落とさない", () => {
  const store = newStore()
  store.actions.perform("item.place", { page: "p1", item: "shape.box", at: { x: 0, y: 0 } }, { book: "b1" })
  expect(store.actions.pressKey("Delete")).toBe(false)
  store.actions.select("s1", ["n1"])
  store.actions.command("s1", "paper.edit", { item: "n1" })
  // ダイアログが開いている間は、ステージの Delete は効かない
  expect(store.actions.pressKey("Delete")).toBe(false)
  expect(store.actions.pressKey("Escape")).toBe(true)
  expect(store.state.getState().dialog).toBeNull()
  expect(store.actions.pressKey("Backspace")).toBe(true)
  expect(store.state.getState().books.b1).toMatchObject({ pages: [{ items: [] }] })
})

test("利用者のキーの変更は settings.keys で入れ、表に効く", () => {
  const store = newStore()
  store.actions.perform("item.place", { page: "p1", item: "shape.box", at: { x: 0, y: 0 } }, { book: "b1" })
  store.actions.select("s1", ["b1"])
  const done = store.actions.perform("settings.keys", {
    added: [{ key: "X", command: "paper.delete", scope: "stage" }],
    removed: [
      { key: "Delete", command: "paper.delete", scope: "stage" },
      { key: "Backspace", command: "paper.delete", scope: "stage" },
    ],
  })
  expect(done.ok).toBe(true)
  expect(store.actions.pressKey("Delete")).toBe(false)
  expect(store.actions.pressKey("X")).toBe(true)
})

const thrown = (run: () => unknown) => {
  try {
    run()
  } catch (e) {
    return isMatomezuError(e) ? e.details.map(p => p.code) : e
  }
  return null
}

test("組み立ては、読めないキー・無いコマンド・外のプラグインがほかのコマンドに結んだ行を誤りにする", () => {
  const own = defineCommand({ id: "k/own", title: "Master", run: () => {}, when: () => true })
  const plugin = (keys: unknown) => definePlugin({ id: "k", commands: [own], keys: keys as never })
  const make = (keys: unknown) => () => createMatomezu({ plugins: [...BUILTIN, plugin(keys)], partial: true })
  expect(thrown(make([{ key: "Hyper+K", command: "k/own", scope: "stage" }]))).toEqual(["E022"])
  expect(thrown(make([{ key: "K", command: "k/none", scope: "stage" }]))).toEqual(["E024"])
  expect(thrown(make([{ key: "K", command: "paper.delete", scope: "stage" }]))).toEqual(["E302"])
  expect(thrown(make([{ key: "Delete", command: "k/own", scope: "stage" }]))).toBeNull()
})
