import { expect, test } from "bun:test"
import { hexToHsv, hsvToHex, isLight, isPaletteName, parseHex } from "../../web/src/core/color"

test("色の値は #rgb か #rrggbb を読み、#rrggbb の小文字にする。ほかは読めない", () => {
  expect(parseHex(" #3B82F6 ")).toBe("#3b82f6")
  expect(parseHex("#abc")).toBe("#aabbcc")
  expect(parseHex("red")).toBeNull()
  expect(parseHex("#12345")).toBeNull()
})

test("代表色の名前は 6 つの役割だけ", () => {
  expect(isPaletteName("primary")).toBe(true)
  expect(isPaletteName("#ffffff")).toBe(false)
})

test("明るさで、上に置く文字を濃くするか白くするかを分ける", () => {
  expect(isLight("#ffffff")).toBe(true)
  expect(isLight("#fff3a6")).toBe(true)
  expect(isLight("#3b82f6")).toBe(false)
  expect(isLight("#000000")).toBe(false)
})

test("色合い・濃さ・明るさと #rrggbb を行き来しても同じ色に戻る", () => {
  for (const hex of ["#3b82f6", "#ef4444", "#22c55e", "#808080", "#000000", "#ffffff"])
    expect(hsvToHex(hexToHsv(hex))).toBe(hex)
  expect(hexToHsv("#808080").s).toBe(0)
})
