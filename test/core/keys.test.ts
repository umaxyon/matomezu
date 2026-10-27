import { expect, test } from "bun:test"
import { keyLabel, normalizeKey, pressedKey, sameBinding, seenInText } from "../../web/src/core/keys"

const press = (
  key: string,
  mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {},
  code = "",
) => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

test("キーの書き方は、修飾キーの順と大文字・小文字をそろえる。読めないものは null", () => {
  expect(normalizeKey("shift+mod+k")).toBe("Mod+Shift+K")
  expect(normalizeKey(" ")).toBe("Space")
  expect(normalizeKey("Delete")).toBe("Delete")
  expect([normalizeKey("Shift"), normalizeKey("Hyper+K"), normalizeKey("Mod+Mod+K"), normalizeKey("")]).toEqual([
    null,
    null,
    null,
    null,
  ])
})

test("押したキーは、Mac では Cmd・ほかでは Ctrl を Mod にする。Alt を押しながらの文字はキーの位置で読む。修飾キーだけなら null", () => {
  expect(pressedKey(press("k", { metaKey: true }), true)).toBe("Mod+K")
  expect(pressedKey(press("k", { ctrlKey: true }), false)).toBe("Mod+K")
  expect(pressedKey(press("k", { ctrlKey: true }), true)).toBe("Ctrl+K")
  expect(pressedKey(press("å", { altKey: true }, "KeyA"), true)).toBe("Alt+A")
  expect(pressedKey(press("Shift", { shiftKey: true }), true)).toBeNull()
})

test("画面に出すキーの名前は、Mac では記号、ほかでは Mod を Ctrl にする", () => {
  expect(keyLabel("Mod+Shift+K", true)).toBe("⌘⇧K")
  expect(keyLabel("Mod+Shift+K", false)).toBe("Ctrl+Shift+K")
})

test("同じ行かは、そろえたキー・コマンド・範囲・引数で比べる", () => {
  const a = { key: "shift+mod+k", command: "x", scope: "stage", args: { n: 1 } }
  expect(sameBinding(a, { ...a, key: "Mod+Shift+K" })).toBe(true)
  expect(sameBinding(a, { ...a, args: { n: 2 } })).toBe(false)
})

test("テキストFormの中で見るのは Escape と、1 行のテキストFormの Enter だけ", () => {
  expect([seenInText("Escape", "multi"), seenInText("Enter", "line"), seenInText("Enter", "multi")]).toEqual([
    true,
    true,
    false,
  ])
  expect(seenInText("Delete", "line")).toBe(false)
})
