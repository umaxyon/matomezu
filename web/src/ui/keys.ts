// キーの受け口: 画面で押したキーを 1 か所で受け、store の割り当てで引いてコマンドを行う（行ったらブラウザの動きを止める）。
// 日本語の変換中のキーは見ない。テキストFormの中では、Escape と 1 行のテキストFormの Enter だけを見る（ほかはテキストFormに任せる）。
// 焦点のあるボタン・リンクの Space と Enter は、それを押す動きに任せる。
// 押した所の要素から外側へたどり、data-key-scope で名乗った範囲（プラグインの範囲）を狭いものから渡す
import { useEffect, useMemo } from "react"
import type { CommandId } from "../core/catalog"
import { keyLabel, pressedKey, seenInText } from "../core/keys"
import { keyChangesOf } from "../core/settings"
import { keysOf, keyTable } from "../store/keys"
import { useActions, useInstance, useMatomezuState } from "./store-context"

// Mac か（Mod を Cmd にし、キーの名前を記号で出す）
export const isMac = (): boolean => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

// 文字を打つ入力Form（テキストForm・セレクトForm・contenteditable。チェックボックスなどは除く）なら、1 行か複数行か
function textField(el: Element | null): "line" | "multi" | null {
  const field = el?.closest("input, textarea, select, [contenteditable]")
  if (!field) return null
  if (field instanceof HTMLInputElement)
    return ["checkbox", "radio", "button", "submit"].includes(field.type) ? null : "line"
  // contenteditable は、1 行と名乗っていれば（aria-multiline="false"）1 行
  return field.getAttribute("aria-multiline") === "false" ? "line" : "multi"
}

function scopesOf(el: Element | null): string[] {
  const scopes: string[] = []
  for (let e = el?.closest("[data-key-scope]"); e; e = e.parentElement?.closest("[data-key-scope]"))
    scopes.push(e.getAttribute("data-key-scope") ?? "")
  return scopes.filter(s => s !== "")
}

// 画面の根に 1 つ置く
export function KeyListener() {
  const { pressKey } = useActions()
  useEffect(() => {
    const mac = isMac()
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return
      const key = pressedKey(e, mac)
      if (!key) return
      const target = e.target instanceof Element ? e.target : null
      const field = textField(target)
      if (field && !seenInText(key, field)) return
      // 焦点のあるボタン・リンクの Space と Enter は、それを押す動き（ブラウザ）に任せる
      if ((key === "Space" || key === "Enter") && target?.closest("button, a[href], [role=button], summary")) return
      if (pressKey(key, scopesOf(target))) e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pressKey])
  return null
}

// コマンドに効いているキーの、画面に出す名前（無ければ null。いくつもあれば勝つ順の最初）
export function useKeyLabel(command: CommandId): string | null {
  const defs = useInstance()
  const settings = useMatomezuState(s => s.settings)
  const table = useMemo(
    () => keyTable([...defs.catalog.store.keys.values()], keyChangesOf(defs.catalog.core, settings)),
    [defs.catalog, settings],
  )
  const first = keysOf(table, command)[0]
  return first ? keyLabel(first.binding.key, isMac()) : null
}
