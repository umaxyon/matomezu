// 編集ロックを掛けるフック: 描いている間、within（ページの id か、ブックの id）の中の物 ids を、利用者が直している物として常駐に知らせる。
// ページの中の物は、アイテムなどとそのページのアノテーションの id、それにページそのもの（ページの id）。ブックの中の物は、バインダとブックそのもの。
// 常駐は、その物を変えるか消す AI のアクションと lockedForUser のアクションと、フォローステップが応じてその物を変えるアクション（行う者を問わない）を断る（being-edited）。ids が空か within が null なら掛けず、描かなくなったら外す。
// ダイアログ（定義の edits）とその場の編集は base が掛ける。ほかに物を直す所（右サイドパネルの中身・テキストForm など）が、開いている間・書いている間に使う

import { useEffect, useId } from "react"
import { useInstance } from "../../../ui/store-context"

export function useEditLock(within: string | null, ids: readonly string[]): void {
  const { setEditLock } = useInstance()
  const key = useId()
  const joined = ids.join(" ")
  // biome-ignore lint/correctness/useExhaustiveDependencies: 物の並びは joined で比べる
  useEffect(() => {
    setEditLock(key, within && ids.length > 0 ? { within, ids: [...ids] } : null)
  }, [setEditLock, key, within, joined])
  useEffect(() => () => setEditLock(key, null), [setEditLock, key])
}

// レコードの編集ロックを掛けるフック: 描いている間、対象の種類 subject のレコード ids を、利用者が直している物として常駐に知らせる（useEditLock のレコード版。
// 常駐は、そのレコードを変えるか消す AI のアクションと lockedForUser のアクションと、フォローステップが応じてそのレコードを変えるアクション（行う者を問わない）を断る）。ids が空か subject が null なら掛けず、描かなくなったら外す
export function useRecordEditLock(subject: string | null, ids: readonly string[]): void {
  const { setEditLock } = useInstance()
  const key = useId()
  const joined = ids.join(" ")
  // biome-ignore lint/correctness/useExhaustiveDependencies: レコードの並びは joined で比べる
  useEffect(() => {
    setEditLock(key, subject && ids.length > 0 ? { subject, ids: [...ids] } : null)
  }, [setEditLock, key, subject, joined])
  useEffect(() => () => setEditLock(key, null), [setEditLock, key])
}
