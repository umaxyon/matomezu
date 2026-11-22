// スクリーンから呼ぶコマンドの文脈の read: コマンドの定義が readsSubjects に書いた種類のレコードだけを読む（ほかの種類は none と空）
import { expect, test } from "bun:test"
import { NO_RECORD } from "../../web/src/core/records"
import { WORKROOM } from "../../web/src/plugins/base/participant/workroom"
import { screenCommandContext } from "../../web/src/store/commands"
import { newStore } from "../support"

test("宣言した種類だけを読み、書かなければどの種類も読まない", () => {
  const store = newStore()
  const r1 = { id: "r1", name: "一", bird: "suzume", createdAt: "2026-11-23T00:00:00Z" }
  const state = { ...store.state.getState(), records: { [WORKROOM.id]: { r1 } } }
  const at = state.window.screens[0]?.id ?? ""
  const read = (reads?: readonly string[]) =>
    screenCommandContext(store.catalog.core, null, state, at, "@matomezu/base:library-open", reads).read
  expect(read([WORKROOM.id]).record(WORKROOM.id, "r1")).toEqual(r1)
  expect(read().record(WORKROOM.id, "r1")).toBe(NO_RECORD)
  expect(read([]).find(WORKROOM.id, [])).toEqual([])
})
