import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { resolveTokens } from "../../web/src/core/theme"
import { BOX } from "../../web/src/plugins/books/drawing/box"
import { paintVars } from "../../web/src/plugins/books/drawing/box/paint"
import { newStore } from "../support"

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
const items = (store: ReturnType<typeof newStore>) =>
  (store.state.getState().books.b1 as BookOf<"drawing">).pages[0]!.items ?? []
const place = (store: ReturnType<typeof newStore>, props: Record<string, unknown>, x = 100) =>
  store.actions.perform("item.place", { page: "p1", item: "shape.box", at: { x, y: 100 }, props }, { book: "b1" })
const update = (store: ReturnType<typeof newStore>, props: Record<string, unknown>) =>
  store.actions.perform("item.update", { page: "p1", item: "n1", props }, { book: "b1" })

test("箱の色は代表色の名前か #rrggbb。ほかは断り、null で消す", () => {
  const store = ready()
  expect(place(store, { caption: "主役", color: "primary" }).ok).toBe(true)
  expect(place(store, { caption: "赤", color: "#ff0000" }, 300).ok).toBe(true)
  expect(place(store, { caption: "無い", color: "red" }, 500).ok).toBe(false)
  expect(update(store, { color: "danger" }).ok).toBe(true)
  expect(items(store)[0]!.props).toMatchObject({ color: "danger" })
  expect(update(store, { color: "#12345" }).ok).toBe(false)
  expect(update(store, { color: null }).ok).toBe(true)
  expect("color" in items(store)[0]!.props).toBe(false)
})

test("テーマごとに代表色を持ち、その上の文字は明るい色ならテーマの文字の色、暗い色なら白", () => {
  const store = ready()
  const tokens = (theme: string) => resolveTokens(store.registry, theme, BOX.tokens)
  expect(tokens("standard")["palette.primary"]).toEqual({ light: "#3b82f6", dark: "#3b82f6" })
  expect(tokens("standard")["palette.primary.ink"]).toEqual({ light: "#ffffff", dark: "#ffffff" })
  expect(tokens("sticky")["palette.primary"]).toEqual({ light: "#cfe2ff", dark: "#cfe2ff" })
  expect(tokens("sticky")["palette.primary.ink"]).toEqual({ light: "#3b3524", dark: "#3b3524" })
  expect(tokens("simple")["palette.danger"]).toEqual({ light: "#fecaca", dark: "#fecaca" })
})

test("色は箱の塗りと文字の欄を上書きする。代表色はテーマの代表色の変数を指し、#rrggbb は暗ければ文字を白に", () => {
  expect(paintVars(undefined)).toBeUndefined()
  expect(paintVars("warn")).toEqual({
    "--theme-box-fill": "var(--theme-palette-warn)",
    "--theme-box-text": "var(--theme-palette-warn-ink)",
  })
  expect(paintVars("#fde68a")).toEqual({ "--theme-box-fill": "#fde68a" })
  expect(paintVars("#1e3a8a")).toEqual({ "--theme-box-fill": "#1e3a8a", "--theme-box-text": "#ffffff" })
})
