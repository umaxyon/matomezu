import { expect, test } from "bun:test"
import { isMatomezuError } from "../../web/src/core/errors"
import { NO_KEY_CHANGES } from "../../web/src/core/keys"
import { warningText } from "../../web/src/core/warnings"
import { BUILTIN } from "../../web/src/plugins"
import { defineCommand } from "../../web/src/store/commands/def"
import { createMatomezu } from "../../web/src/store/create"
import { type DefaultKey, inspectKey, keyScopes, keysOf, keyTable, shadowedKeys } from "../../web/src/store/keys"
import { definePlugin, warningsOf } from "../../web/src/store/plugin"
import { newStore } from "../support"

const def = (key: string, command: string, plugin: string, builtin = false, scope = "stage"): DefaultKey => ({
  id: `${plugin}:${scope}-${key}`,
  binding: { key, command, scope },
  plugin,
  builtin,
})

test("勝つ順は 利用者 > ビルトインプラグイン > 追加プラグイン。追加の既定はビルトインとぶつかれば使わず、追加どうしでぶつかればどちらも使わない", () => {
  const defaults = [
    def("Delete", "@matomezu/paper:paper-delete", "@matomezu/paper", true),
    def("Delete", "a:del", "a"),
    def("D", "a:dup", "a"),
    def("D", "b:dup", "b"),
    def("E", "b:edit", "b"),
  ]
  const table = keyTable(defaults, NO_KEY_CHANGES)
  expect(table.active.map(e => e.binding.command)).toEqual(["@matomezu/paper:paper-delete", "b:edit"])
  expect(table.dropped.map(d => [d.entry.binding.command, d.reason])).toEqual([
    ["a:del", "builtin"],
    ["a:dup", "plugins"],
    ["b:dup", "plugins"],
  ])
  // 利用者が足した行はビルトインプラグインに勝ち、後に足したものが先
  const user = keyTable(defaults, {
    added: [
      { key: "Delete", command: "x:one", scope: "stage" },
      { key: "Delete", command: "x:two", scope: "stage" },
    ],
    removed: [],
  })
  expect(inspectKey(user, { scope: "stage", key: "Delete" })).toMatchObject({
    value: "x:two",
    decidedBy: { source: "key", from: "user" },
  })
  expect(inspectKey(user, { scope: "stage", key: "Delete" }).steps.map(s => [s.value, s.from])).toEqual([
    ["x:two", expect.objectContaining({ from: "user" })],
    ["x:one", expect.objectContaining({ from: "user" })],
    ["@matomezu/paper:paper-delete", expect.objectContaining({ from: "builtin" })],
    [null, expect.objectContaining({ from: "plugin", plugin: "a", dropped: "builtin" })],
  ])
})

test("キーを変えるのは、既定の行を外して新しい行を足す。当たる先の無い変更は残すが効かない", () => {
  const defaults = [def("Delete", "@matomezu/paper:paper-delete", "@matomezu/paper", true)]
  const table = keyTable(defaults, {
    added: [
      { key: "Mod+Backspace", command: "@matomezu/paper:paper-delete", scope: "stage" },
      { key: "X", command: "gone:command", scope: "stage" },
    ],
    removed: [
      { key: "Delete", command: "@matomezu/paper:paper-delete", scope: "stage" },
      { key: "Q", command: "gone:other", scope: "stage" },
    ],
  })
  expect(keysOf(table, "@matomezu/paper:paper-delete").map(e => e.binding.key)).toEqual(["Mod+Backspace"])
  expect(table.dropped).toMatchObject([{ reason: "removed", entry: { binding: { key: "Delete" } } }])
})

test("範囲は狭いものから引き、メニューとダイアログが開いている間はほかを見ない。アプリ全体の行がステージで隠れるかを返す", () => {
  expect(keyScopes({ menu: false, dialog: false }, ["a:panel"])).toEqual(["a:panel", "stage", "global"])
  expect(keyScopes({ menu: false, dialog: true })).toEqual(["dialog"])
  expect(keyScopes({ menu: true, dialog: true })).toEqual(["menu"])
  // カレントのステージの見せ方が名乗った範囲は、押した所の範囲のあと、ステージの範囲の前（ダイアログ・メニューの間は探さない）
  expect(keyScopes({ menu: false, dialog: false }, ["a:panel"], "b:view")).toEqual([
    "a:panel",
    "b:view",
    "stage",
    "global",
  ])
  expect(keyScopes({ menu: false, dialog: true }, [], "b:view")).toEqual(["dialog"])
  const table = keyTable(
    [
      def("D", "app:thing", "@matomezu/base", true, "global"),
      def("D", "@matomezu/paper:paper-delete", "@matomezu/paper", true),
    ],
    NO_KEY_CHANGES,
  )
  expect(shadowedKeys(table)).toMatchObject([
    { entry: { binding: { command: "app:thing" } }, by: { binding: { command: "@matomezu/paper:paper-delete" } } },
  ])
})

test("押したキーは、当たった範囲のコマンドを行い、押せないコマンドなら外の範囲へは落とさない", () => {
  const store = newStore()
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-box", at: { x: 0, y: 0 } },
    { book: "b1" },
  )
  expect(store.actions.pressKey("Delete")).toBe(false)
  store.actions.select("s1", ["n1"])
  store.actions.command("s1", "@matomezu/paper:paper-edit", { item: "n1" })
  // ダイアログが開いている間は、ステージの Delete は効かない
  expect(store.actions.pressKey("Delete")).toBe(false)
  expect(store.actions.pressKey("Escape")).toBe(true)
  expect(store.state.getState().dialog).toBeNull()
  expect(store.actions.pressKey("Backspace")).toBe(true)
  expect(store.state.getState().books.b1).toMatchObject({ pages: [{ items: [] }] })
})

test("利用者のキーの変更は @matomezu/base:settings-keys で入れ、表に効く", () => {
  const store = newStore()
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-box", at: { x: 0, y: 0 } },
    { book: "b1" },
  )
  store.actions.select("s1", ["b1"])
  const done = store.actions.perform("@matomezu/base:settings-keys", {
    added: [{ key: "X", command: "@matomezu/paper:paper-delete", scope: "stage" }],
    removed: [
      { key: "Delete", command: "@matomezu/paper:paper-delete", scope: "stage" },
      { key: "Backspace", command: "@matomezu/paper:paper-delete", scope: "stage" },
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

test("組み立ては、読めないキー・無いコマンド・追加プラグインがほかのコマンドに結んだ行を error にする", () => {
  const own = defineCommand({ id: "k:own", title: "@matomezu/master:Master", run: () => {}, when: () => true })
  const plugin = (keys: unknown) => definePlugin({ id: "k", commands: [own], keys: keys as never })
  const make = (keys: unknown) => () => createMatomezu({ plugins: [...BUILTIN, plugin(keys)], partial: true })
  expect(thrown(make([{ id: "k:a", key: "Hyper+K", command: "k:own", scope: "stage" }]))).toEqual(["E022"])
  expect(thrown(make([{ id: "k:a", key: "K", command: "k:none", scope: "stage" }]))).toEqual(["E024"])
  expect(thrown(make([{ id: "k:a", key: "K", command: "@matomezu/paper:paper-delete", scope: "stage" }]))).toEqual([
    "E302",
  ])
  expect(thrown(make([{ id: "k:a", key: "Delete", command: "k:own", scope: "stage" }]))).toBeNull()
})

test("追加プラグインの既定のキーがビルトインに負けたら W008、ほかの追加プラグインとぶつかったら W009 の warning を残す（どちらもその行は使わない）", () => {
  const command = (id: string) =>
    defineCommand({ id, title: "@matomezu/master:Master", run: () => {}, when: () => true })
  // id を引数で作るので、頭の確かめの型は外して渡す（組み立ての確かめは実行時に通る）
  const plugin = (id: string, key: string) =>
    definePlugin({
      id,
      commands: [command(`${id}:own`)],
      keys: [{ id: `${id}:own-key`, key, command: `${id}:own`, scope: "stage" }],
    } as never)
  const instance = createMatomezu({
    plugins: [...BUILTIN, plugin("a", "Delete"), plugin("b", "K"), plugin("c", "K"), plugin("d", "J")],
    partial: true,
  })
  expect(warningsOf(instance.catalog).map(warningText)).toEqual([
    "W008 a: key Delete in stage for a:own: a builtin plugin's key is there (not used)",
    "W009 b: key K in stage for b:own: another added plugin c has the same key (neither is used)",
    "W009 c: key K in stage for c:own: another added plugin b has the same key (neither is used)",
  ])
})

test("既定の割り当ては id で機能台帳に並び、同じ id は error。頭が自分のプラグインの id でない id も error", () => {
  const own = defineCommand({ id: "k:own", title: "@matomezu/master:Master", run: () => {}, when: () => true })
  const plugin = (keys: unknown) => definePlugin({ id: "k", commands: [own], keys: keys as never })
  const make = (keys: unknown) => () => createMatomezu({ plugins: [...BUILTIN, plugin(keys)], partial: true })
  const one = { id: "k:a", key: "K", command: "k:own", scope: "stage" }
  expect(thrown(make([one, { ...one, key: "J" }]))).toEqual(["E001"])
  expect(() => make([{ ...one, id: "z:a" }])()).toThrow("E301")
  const instance = createMatomezu({ plugins: [...BUILTIN, plugin([one])], partial: true })
  expect(instance.catalog.store.keys.get("k:a")?.binding).toEqual({ key: "K", command: "k:own", scope: "stage" })
  expect(instance.catalog.store.keys.get("@matomezu/paper:paper-delete-delete")?.binding.key).toBe("Delete")
})
