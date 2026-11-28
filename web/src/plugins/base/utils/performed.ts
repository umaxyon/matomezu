// アクションの答えの結果を使う: 画面で先に行えたなら今、常駐へ送った（SENT_TO_HOST）なら常駐が行った後で、結果を渡す

import { SENT_TO_HOST } from "../../../store/actions"

// perform の答え（store/actions.ts の Performed）の形。行えたか断られたかで分けた後の答えも渡せる
type Answer<R> =
  | { ok: false }
  | { ok: true; result: R }
  | { ok: true; result: typeof SENT_TO_HOST; confirmed: Promise<{ ok: true; result: R } | { ok: false }> }

// perform の答え done が行えたなら、結果で fn を呼ぶ（断られたら呼ばない。送ったなら、常駐が行ったとき。常駐が断れば呼ばない）
export function whenPerformed<R>(done: Answer<R>, fn: (result: Exclude<R, typeof SENT_TO_HOST>) => void): void {
  if (!done.ok) return
  if (!("confirmed" in done)) {
    if (done.result !== SENT_TO_HOST) fn(done.result as Exclude<R, typeof SENT_TO_HOST>)
    return
  }
  void done.confirmed.then(d => {
    if (d.ok) fn(d.result as Exclude<R, typeof SENT_TO_HOST>)
  })
}
