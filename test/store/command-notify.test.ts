// 1 回のコマンドの書き込みは、購読に 1 回で知らせる（前の値は始める前の値）。同じ状態で同じ場所から同じコマンドを問えば、作った文脈を使い回す

import { expect, test } from "bun:test"
import { called, isActive, isEnabled, isShown } from "../../web/src/store/commands"
import type { MatomezuState } from "../../web/src/store/state"
import { SAMPLE_BOOKS } from "../sample-books"
import { NO_BOOK_SCREEN, newStore, showFirstBook, worldRows } from "../support"

function setup() {
  const store = newStore({ bookScreen: NO_BOOK_SCREEN })
  store.receive({ ...worldRows(SAMPLE_BOOKS), settings: {} }, [])
  showFirstBook(store)
  const run = (at: string, id: string) =>
    (store.actions.command as (at: string, id: string) => boolean)(at, `@matomezu/base:${id}`)
  return { store, run }
}

test("郵便箱を開くコマンドは store に何度か書くが、購読には 1 回だけ、始める前の値と終えたあとの値で知らせる", () => {
  const { store, run } = setup()
  const before = store.state.getState()
  const told: [MatomezuState, MatomezuState][] = []
  const stop = store.state.subscribe((now, was) => told.push([now, was]))
  expect(run("s1", "mailbox-open")).toBe(true)
  stop()
  expect(told).toHaveLength(1)
  expect(told[0]?.[1]).toBe(before)
  expect(told[0]?.[0]).toBe(store.state.getState())
  expect(store.state.getState().window.screens.some(s => s.def === "@matomezu/base:mailbox-screen")).toBe(true)
})

test("同じ状態で同じ場所から同じコマンドを問えば同じ文脈を返し、状態が替われば作り直す", () => {
  const { store, run } = setup()
  const id = "@matomezu/base:mailbox-open"
  const state = store.state.getState()
  const first = called(store, state, "s1", id)
  expect(first).not.toBeNull()
  expect(called(store, state, "s1", id)).toBe(first)
  expect([
    isShown(store, state, "s1", id),
    isEnabled(store, state, "s1", id),
    isActive(store, state, "s1", id),
  ]).toEqual([true, true, false])
  run("s1", "mailbox-open")
  expect(called(store, store.state.getState(), "s1", id)).not.toBe(first)
})
