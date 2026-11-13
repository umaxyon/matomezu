// useRecords・useRecord: 種類のレコードのうち索引キーの条件に合う物を、並びの順に件数まで返し（並びが無ければ id の順）、定義の record に合わない物は返さない。その種類が変わらない間は同じ参照

import { describe, expect, test } from "bun:test"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { useRecord, useRecords } from "../../web/src/ui/view-hooks"

const WORKROOM = "@matomezu/base:workroom"
const TICKET = "@matomezu/taskboard:ticket"
const MAIL = "@matomezu/base:mail"
const letter = (n: number, seen: boolean) => ({
  id: `m${n}`,
  mail: "@matomezu/base:letter",
  from: "a",
  sentAt: "2026-11-12T00:00:00.000Z",
  props: { title: `t${n}`, body: "" },
  order: n,
  ...(seen ? { seenAt: "2026-11-12T00:00:00.000Z" } : {}),
})

function setup() {
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    plugins: BUILTIN_UI,
    newId: (() => {
      let n = 0
      return () => `n${++n}`
    })(),
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      {children}
    </MatomezuProvider>
  )
  return { store, wrapper }
}

describe("レコードを読むフック", () => {
  test("ワークルームを足すと id の順に並び、1 件も引ける。別の種類が変わっても、同じ参照のまま", () => {
    const { store, wrapper } = setup()
    const rooms = renderHook(() => useRecords(WORKROOM, { where: [] }), { wrapper })
    expect(rooms.result.current).toEqual([])
    act(() => {
      store.actions.perform("@matomezu/base:workroom-add", { name: "あ", bird: "inko" })
      store.actions.perform("@matomezu/base:workroom-add", { name: "い", bird: "inko" })
    })
    const list = rooms.result.current
    expect(list.map(r => r.name)).toEqual(["あ", "い"])
    const one = renderHook(() => useRecord(WORKROOM, list[1]?.id ?? ""), { wrapper })
    expect(one.result.current?.name).toBe("い")
    expect(renderHook(() => useRecord(WORKROOM, "nothing"), { wrapper }).result.current).toBeUndefined()
    // 別の種類のレコードが変わっても、ワークルームの配列は変わらない
    act(() => {
      store.actions.perform("@matomezu/taskboard:project-add", {})
    })
    rooms.rerender()
    expect(rooms.result.current).toBe(list)
  })

  test("定義の record に合わないレコードは返さない", () => {
    const { store, wrapper } = setup()
    // タスクボードのチケットの形に合わない物（常駐から来た、古い形のレコード）を入れる
    act(() => store.receive({ books: [], settings: {}, records: { [TICKET]: { old: { id: "old", name: "x" } } } }, []))
    expect(renderHook(() => useRecords(TICKET, { where: [] }), { wrapper }).result.current).toEqual([])
    expect(renderHook(() => useRecord(TICKET, "old"), { wrapper }).result.current).toBeUndefined()
  })

  test("索引キーの条件に合う物を、並びの順に件数まで返す。宣言に無い索引キーを書けば何も返さない", () => {
    const { store, wrapper } = setup()
    const mails = Object.fromEntries([1, 2, 3, 4].map(n => [`m${n}`, letter(n, n === 2)]))
    act(() => store.receive({ books: [], settings: {}, records: { [MAIL]: mails } }, []))
    const ids = (query: Parameters<typeof useRecords>[1]) =>
      renderHook(() => useRecords(MAIL, query), { wrapper }).result.current.map(m => m.id)
    expect(ids({ where: [] })).toEqual(["m1", "m2", "m3", "m4"])
    expect(ids({ where: [{ key: "seenAt", is: "absent" }], order: { key: "order", dir: "desc" } })).toEqual([
      "m4",
      "m3",
      "m1",
    ])
    expect(ids({ where: [], order: { key: "order", dir: "desc" }, limit: 2 })).toEqual(["m4", "m3"])
    expect(ids({ where: [{ key: "from", eq: "a" }] })).toEqual([])
    expect(ids({ where: [], order: { key: "from", dir: "asc" } })).toEqual([])
  })
})
