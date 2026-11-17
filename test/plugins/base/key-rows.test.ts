// キーバインドの設定画面の行（base/settings/key-rows.ts）: 範囲・コマンド・args ごとの行と、行のキーを足す・外す・既定に戻した利用者の変更
import { expect, test } from "bun:test"
import { NO_KEY_CHANGES } from "../../../web/src/core/keys"
import { keyRows, withKeyAdded, withKeyRemoved, withRowReset } from "../../../web/src/plugins/base/settings/key-rows"
import type { DefaultKey } from "../../../web/src/store/keys"

const def = (key: string, command: string, plugin: string, builtin = false, scope = "stage"): DefaultKey => ({
  id: `${plugin}:${scope}-${key}`,
  binding: { key, command, scope },
  plugin,
  builtin,
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
