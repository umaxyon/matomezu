// 見たまま編集の入力Form（base の RichInput）で、字の位置 start から end までを選ぶ（記号を数えない字の位置）
import type { Locator } from "@playwright/test"

export async function selectText(input: Locator, start: number, end: number) {
  await input.evaluate(
    (el, [a, b]) => {
      const nodes: Text[] = []
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
      const point = (at: number): [Node, number] => {
        let left = at
        for (const t of nodes) {
          if (left <= t.data.length) return [t, left]
          left -= t.data.length
        }
        return [el, el.childNodes.length]
      }
      const r = document.createRange()
      r.setStart(...point(a as number))
      r.setEnd(...point(b as number))
      const s = document.getSelection()!
      s.removeAllRanges()
      s.addRange(r)
    },
    [start, end],
  )
}
