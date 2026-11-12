// プロジェクト設定の一覧（レーン・チケットタグ）の行を、ダイアログの中で持つフック。片付け方は settings-rows の純関数。
// add は名前の空の行を足し、その行の名前の入力Formに入る（nameRef を名前の入力Formに付ける）。leave は名前の入力Formを離れた行を片付ける
import { useEffect, useRef, useState } from "react"
import { changeRow, type LaneRow, leaveRow, moveRow, type TagRow } from "./settings-rows"

// 足す行の、鍵と名前を除いた中身（行の種類ごとに）
type Blank<R> = R extends unknown ? Omit<R, "key" | "name"> : never

export function useEditableRows<R extends LaneRow | TagRow>(initial: () => R[]) {
  const [rows, setRows] = useState<R[]>(initial)
  const next = useRef(1)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const focusRef = useRef<HTMLInputElement>(null)

  // 足した行の名前の入力Formに入る（行が描かれてから）
  useEffect(() => {
    if (focusKey === null) return
    focusRef.current?.focus()
    setFocusKey(null)
  }, [focusKey])

  const change = (key: string, patch: Partial<R>) => setRows(list => changeRow(list, key, patch))
  const add = (blank: Blank<R>) => {
    const key = `new-${next.current++}`
    setRows(list => [...list, { ...blank, key, name: "" } as unknown as R])
    setFocusKey(key)
    return key
  }
  const leave = (key: string) => setRows(list => leaveRow(list, key))
  const move = (dragging: string, over: string) => setRows(list => moveRow(list, dragging, over))
  const nameRef = (key: string) => (key === focusKey ? focusRef : undefined)

  return { rows, change, add, leave, move, nameRef }
}

export type EditableRows<R extends LaneRow | TagRow> = ReturnType<typeof useEditableRows<R>>
