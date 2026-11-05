import { expect, test } from "bun:test"
import type { MatomezuError } from "../../web/src/core/errors"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { NO_KEY_CHANGES } from "../../web/src/core/keys"
import { warningText } from "../../web/src/core/warnings"
import { BUILTIN } from "../../web/src/plugins"
import { defineCommand } from "../../web/src/store/commands/def"
import { createMatomezu } from "../../web/src/store/create"
import {
  BASE_KEY_SCOPE_TITLES,
  type DefaultKey,
  inspectKey,
  keyRows,
  keyScopes,
  keysOf,
  keyTable,
  shadowedKeys,
  withKeyAdded,
  withKeyRemoved,
  withRowReset,
} from "../../web/src/store/keys"
import { pluginKit } from "../../web/src/store/kit"
import { definePlugin, warningsOf } from "../../web/src/store/plugin"
import { newStore } from "../support"

const def = (key: string, command: string, plugin: string, builtin = false, scope = "stage"): DefaultKey => ({
  id: `${plugin}:${scope}-${key}`,
  binding: { key, command, scope },
  plugin,
  builtin,
})

test("同じ範囲・同じキーは捨てずに 利用者 → ビルトインプラグイン → 追加プラグインの id の順に並べ、先頭の行だけが効く", () => {
  const defaults = [
    def("D", "b:dup", "b"),
    def("Delete", "@matomezu/paper:paper-delete", "@matomezu/paper", true),
    def("Delete", "a:del", "a"),
    def("D", "a:dup", "a"),
    def("E", "b:edit", "b"),
  ]
  const table = keyTable(defaults, NO_KEY_CHANGES)
  // 追加プラグインは読み込んだ順でなく id の順（a が b より先）。同じプラグインの中は書いた順
  expect(table.active.map(e => e.binding.command)).toEqual([
    "@matomezu/paper:paper-delete",
    "a:del",
    "a:dup",
    "b:dup",
    "b:edit",
  ])
  expect(table.dropped).toEqual([])
  expect(inspectKey(table, { scope: "stage", key: "Delete" }).value).toBe("@matomezu/paper:paper-delete")
  expect(inspectKey(table, { scope: "stage", key: "D" }).value).toBe("a:dup")
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
    ["a:del", expect.objectContaining({ from: "plugin", plugin: "a" })],
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

test("範囲は狭いものから引き、メニューとダイアログが開いている間はほかを見ない。global の範囲のキーが、ステージの範囲のキーに隠れるかを返す", () => {
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
  // テキストFormが名乗った範囲だけで引くときは、ほかの範囲を見ない
  expect(keyScopes({ menu: false, dialog: false }, ["a:field"], "b:view", "named")).toEqual(["a:field"])
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
    { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x: 0, y: 0 } },
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

test("利用者のキーの変更は利用者の設定の項目 @matomezu/base:keys に入れ、表に効く", () => {
  const store = newStore()
  const placed = store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x: 0, y: 0 } },
    { book: "b1" },
  )
  store.actions.select("s1", [placed.ok ? (placed.result as { item: string }).item : ""])
  const done = store.actions.perform("@matomezu/base:settings-set", {
    values: {
      "@matomezu/base:keys": {
        added: [{ key: "X", command: "@matomezu/paper:paper-delete", scope: "stage" }],
        removed: [
          { key: "Delete", command: "@matomezu/paper:paper-delete", scope: "stage" },
          { key: "Backspace", command: "@matomezu/paper:paper-delete", scope: "stage" },
        ],
      },
    },
  })
  expect(done.ok).toBe(true)
  expect(store.actions.pressKey("Delete")).toBe(false)
  expect(store.actions.pressKey("X")).toBe(true)
})

const thrown = (run: () => unknown) => {
  try {
    run()
  } catch (e) {
    return e instanceof Error && e.name === "MatomezuError" ? (e as MatomezuError).details.map(p => p.code) : e
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

test("追加プラグインの既定のキーバインドがビルトインの行に負けたら W008、id の順で先の追加プラグインの行に負けたら W021 の warning を残す（負けた行は効かない）", () => {
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
    "W021 c: key K in stage for c:own: added plugin b's key is there first (not used)",
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

test("キーの範囲は定義（KeyScopeDef）で機能台帳に並び、題名を持つ。kit が id と題名に頭を付け、同じ id は error。土台の範囲の題名は土台が持つ", () => {
  const kit = pluginKit("k", defineMessages({ Panel: { en: "Panel", ja: "パネル" } }))
  const scope = kit.defineKeyScope({ id: "panel", title: "Panel" })
  expect(scope).toEqual({ id: "k:panel", title: "k:Panel" })
  const make = (scopes: readonly unknown[]) => () =>
    createMatomezu({ plugins: [...BUILTIN, kit.plugin({ keyScopes: scopes as never })], partial: true })
  const instance = make([scope])()
  expect(instance.catalog.store.keyScopes.get("k:panel")?.title).toBe("k:Panel")
  expect(instance.catalog.store.keyScopes.get("@matomezu/tree:tree")?.title).toBe("@matomezu/tree:Tree")
  expect(thrown(make([scope, scope]))).toEqual(["E001"])
  expect(Object.keys(BASE_KEY_SCOPE_TITLES)).toEqual(["global", "stage", "dialog", "menu"])
})

test("設定画面の行は 範囲・コマンド・args ごと。効いていない行は first が別の行。足す・外す・行を既定に戻すは利用者の変更を作り直す", () => {
  const defaults = [
    def("Z", "a:undo", "@matomezu/a", true),
    def("Y", "a:redo", "@matomezu/a", true),
    {
      ...def("ArrowUp", "t:move", "t"),
      binding: { key: "ArrowUp", command: "t:move", scope: "stage", args: { to: "up" } },
      title: "t:Up",
    },
    {
      ...def("ArrowDown", "t:move", "t"),
      binding: { key: "ArrowDown", command: "t:move", scope: "stage", args: { to: "down" } },
    },
    def("Z", "p:other", "p"),
  ]
  const rows = keyRows(defaults, NO_KEY_CHANGES)
  expect(rows.map(r => [r.command, r.args, r.title])).toEqual([
    ["a:undo", undefined, undefined],
    ["a:redo", undefined, undefined],
    ["t:move", { to: "up" }, "t:Up"],
    ["t:move", { to: "down" }, undefined],
    ["p:other", undefined, undefined],
  ])
  // p:other の Z は、ビルトインの a:undo が先なので効いていない
  const other = rows[4]!.keys[0]!
  expect(other.first.binding.command).toBe("a:undo")
  expect(rows[0]!.keys[0]!.first).toBe(rows[0]!.keys[0]!.entry)

  const undoZ = { key: "Z", command: "a:undo", scope: "stage" }
  // 既定を外すと外した行に、利用者の行を足すと足した行に入る。足し直すと外したのを取り消す
  const removed = withKeyRemoved(NO_KEY_CHANGES, undoZ)
  expect(removed).toEqual({ added: [], removed: [undoZ] })
  expect(withKeyAdded(removed, undoZ)).toEqual(NO_KEY_CHANGES)
  const added = withKeyAdded(removed, { key: "mod+u", command: "a:undo", scope: "stage" })
  expect(added.added).toEqual([{ key: "Mod+U", command: "a:undo", scope: "stage" }])
  expect(keyRows(defaults, added)[0]).toMatchObject({ changed: true })
  expect(withKeyRemoved(added, { key: "Mod+U", command: "a:undo", scope: "stage" }).added).toEqual([])
  // 行を既定に戻すと、その行の変更だけが消える（args で分かれる行も、その args の行だけ）
  const moved = withKeyAdded(added, { key: "K", command: "t:move", scope: "stage", args: { to: "up" } })
  expect(withRowReset(moved, { scope: "stage", command: "a:undo" })).toEqual({
    added: [{ key: "K", command: "t:move", scope: "stage", args: { to: "up" } }],
    removed: [],
  })
  expect(withRowReset(moved, { scope: "stage", command: "t:move", args: { to: "down" } })).toEqual(moved)
  // 利用者の行は先なので、ぶつかったビルトインの行が効かなくなる
  const taken = keyRows(defaults, withKeyAdded(NO_KEY_CHANGES, { key: "Y", command: "a:undo", scope: "stage" }))
  expect(taken[1]!.keys[0]!.first.binding.command).toBe("a:undo")
})
