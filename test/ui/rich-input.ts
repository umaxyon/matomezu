// 見たまま編集の入力Form（base の RichInput）に書く。happy-dom では打てないので、字を入れて input を送る。
// 字だけなら装飾なし、区切りの並びなら [字, 太字か] ごとに
import { fireEvent } from "@testing-library/react"

export function writeRich(el: Element, text: string | readonly (readonly [string, boolean])[]) {
  const runs = typeof text === "string" ? [[text, false] as const] : text
  el.replaceChildren(
    ...runs.map(([t, bold]) => {
      const span = document.createElement("span")
      if (bold) span.dataset.bold = "true"
      span.textContent = t
      return span
    }),
  )
  fireEvent.input(el)
}
