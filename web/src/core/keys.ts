// キー: 押したキーの書き方と、割り当て（キー → コマンド）の形・利用者の変更。
// 書き方は「修飾キー+キー」（例: Mod+Shift+K・Delete・Escape）。Mod は Mac では Cmd（Meta）、ほかでは Ctrl。
// 修飾キーの順は Mod・Ctrl・Meta・Alt・Shift にそろえ、1 文字のキーは大文字、空白は Space で書く（比べるのは、そろえた書き方どうし）。
// 名前の付いたキー（Delete・Escape・ArrowLeft など）は、ブラウザのキーの名前（KeyboardEvent.key）の書き方のまま書く
import { z } from "zod"

const MODIFIERS = ["Mod", "Ctrl", "Meta", "Alt", "Shift"] as const
type Modifier = (typeof MODIFIERS)[number]

// キーの名前をそろえる（1 文字は大文字、空白は Space）
const keyName = (key: string) => (key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key)

// 書いたキーをそろえた書き方にする。読めなければ null（修飾キーだけ・知らない修飾キー・同じ修飾キーを 2 度）
export function normalizeKey(text: string): string | null {
  const parts = text.split("+")
  const key = parts.pop()
  if (!key) return null
  const mods = new Set<Modifier>()
  for (const m of parts) {
    const found = MODIFIERS.find(x => x.toLowerCase() === m.toLowerCase())
    if (!found || mods.has(found)) return null
    mods.add(found)
  }
  if (MODIFIERS.some(m => m.toLowerCase() === key.toLowerCase())) return null
  return [...MODIFIERS.filter(m => mods.has(m)), keyName(key)].join("+")
}

// 押したキーの様子（KeyboardEvent のうち、使う所）
export interface Pressed {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift", "OS"])

// 押したキーを、そろえた書き方にする（修飾キーだけを押したなら null）。
// Alt を押しながらの文字は、Mac では別の文字になるので、キーの位置（code）から名前を決める
export function pressedKey(e: Pressed, mac: boolean): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const fromCode = /^Key([A-Z])$|^Digit([0-9])$/.exec(e.code)
  const key = e.altKey && fromCode ? (fromCode[1] ?? fromCode[2] ?? e.key) : e.key
  const mods: Modifier[] = []
  if (mac ? e.metaKey : e.ctrlKey) mods.push("Mod")
  if (mac && e.ctrlKey) mods.push("Ctrl")
  if (!mac && e.metaKey) mods.push("Meta")
  if (e.altKey) mods.push("Alt")
  if (e.shiftKey) mods.push("Shift")
  return [...mods, keyName(key)].join("+")
}

// 画面に出すキーの名前（Mac は記号）
export function keyLabel(key: string, mac: boolean): string {
  const MAC: Record<string, string> = { Mod: "⌘", Ctrl: "⌃", Meta: "⌘", Alt: "⌥", Shift: "⇧", Backspace: "⌫" }
  const parts = key.split("+")
  return mac ? parts.map(p => MAC[p] ?? p).join("") : parts.map(p => (p === "Mod" ? "Ctrl" : p)).join("+")
}

// 割り当ての 1 行: キーをどの範囲で押したら、どのコマンドを呼ぶか（args はコマンドに渡す決まった値）
export const KeyBindingSchema = z.strictObject({
  key: z.string().min(1),
  command: z.string().min(1),
  scope: z.string().min(1),
  args: z.unknown().optional(),
})
export type KeyBinding = z.infer<typeof KeyBindingSchema>

// 利用者の変更: 足した行と、使わないことにした既定の行（キーを変えるのは、既定の行を外して新しい行を足す）
export const KeyChangesSchema = z.strictObject({
  added: z.array(KeyBindingSchema),
  removed: z.array(KeyBindingSchema),
})
export type KeyChanges = z.infer<typeof KeyChangesSchema>

export const NO_KEY_CHANGES: KeyChanges = { added: [], removed: [] }

// 同じ行か（キーはそろえた書き方で、引数は値で比べる）
export function sameBinding(a: KeyBinding, b: KeyBinding): boolean {
  return (
    normalizeKey(a.key) === normalizeKey(b.key) &&
    a.command === b.command &&
    a.scope === b.scope &&
    JSON.stringify(a.args) === JSON.stringify(b.args)
  )
}

// 文字の入力欄の中で見るキー（ほかのキーは入力欄に任せる）。1 行の欄の Enter と、Escape
export function seenInText(key: string, field: "line" | "multi"): boolean {
  return key === "Escape" || (key === "Enter" && field === "line")
}
