// 編集前のロックを掛けるフック: 描いている間、ブック book の物 ids（ブックの中の物やアノテーションの id）を、利用者が直している物として常駐に知らせる。
// 常駐は、その物を変えるか消す AI のアクションを断る（being-edited）。ids が空か book が null なら掛けず、描かなくなったら外す。
// 掛けるのは、物を直す所（右サイドパネルの中身など）を開いている間

import { useEffect, useId } from "react"
import { useInstance } from "../../../ui/store-context"

export function useEditLock(book: string | null, ids: readonly string[]): void {
  const { setEditLock } = useInstance()
  const key = useId()
  const joined = ids.join(" ")
  // biome-ignore lint/correctness/useExhaustiveDependencies: 物の並びは joined で比べる
  useEffect(() => {
    setEditLock(key, book && ids.length > 0 ? { book, ids: [...ids] } : null)
  }, [setEditLock, key, book, joined])
  useEffect(() => () => setEditLock(key, null), [setEditLock, key])
}
