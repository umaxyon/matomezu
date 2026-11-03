// マークダウンの描いた文書（markdown の view/MarkdownDocumentView.tsx）と、リンク・画像の行き先（link-target.ts）・縮める倍率（shrink.ts）
import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { parseMarkdown } from "../../web/src/plugins/base"
import { blockKeys } from "../../web/src/plugins/books/markdown/block-keys"
import { linkTarget } from "../../web/src/plugins/books/markdown/link-target"
import { shrinkTo } from "../../web/src/plugins/books/markdown/shrink"
import { MarkdownDocumentView } from "../../web/src/plugins/books/markdown/view/MarkdownDocumentView"

afterEach(cleanup)

const draw = (text: string) => render(<MarkdownDocumentView document={parseMarkdown(text)} />).container

test("見出し・リスト・表・脚注を描く", () => {
  const c = draw("# T\n\n- [x] done\n- b\n\n| h |\n|-|\n| v |\n\nn[^a]\n\n[^a]: note\n")
  expect(c.querySelector("h1")?.textContent).toBe("T")
  expect(c.querySelectorAll("ul > li")).toHaveLength(2)
  expect(c.querySelector<HTMLInputElement>("li input[type=checkbox]")?.checked).toBe(true)
  expect(c.querySelector("th")?.textContent).toBe("h")
  expect(c.querySelector("sup a")?.textContent).toBe("1")
  expect(c.querySelector('[data-markdown-fragment="fn:1"]')?.textContent).toContain("note")
})

test("http・https・mailto のリンクは新しいタブで開き、ほかの行き先は開かない", () => {
  const c = draw("[a](https://x.test) [m](mailto:a@x.test) [j](javascript:alert(1)) [r](./page)")
  const links = [...c.querySelectorAll("a")]
  expect(links.map(a => a.getAttribute("href"))).toEqual(["https://x.test", "mailto:a@x.test"])
  expect(links.every(a => a.target === "_blank" && a.rel === "noopener noreferrer")).toBe(true)
  expect(c.textContent).toContain("j")
  expect(c.textContent).toContain("r")
})

test("画像は原文に埋め込んだ物だけを描き、外の画像は説明の文にする", () => {
  const c = draw("![in](data:image/png;base64,AA==) ![out](https://x.test/a.png)")
  const images = [...c.querySelectorAll("img")]
  expect(images.map(i => i.getAttribute("alt"))).toEqual(["in"])
  expect(c.textContent).toContain("out")
})

test("# のリンクは、location を変えずに、文書の中の見出しへスクロールする", () => {
  const c = draw("[go](#second-part)\n\n# First\n\n# Second Part\n")
  const scrolled: string[] = []
  for (const h of c.querySelectorAll<HTMLElement>("[data-markdown-fragment]"))
    h.scrollIntoView = () => void scrolled.push(h.getAttribute("data-markdown-fragment")!)
  const before = location.hash
  fireEvent.click(c.querySelector("a")!)
  expect(scrolled).toEqual(["second-part"])
  expect(location.hash).toBe(before)
})

test("見出し「fn 1」があっても、脚注の参照は脚注へ飛ぶ", () => {
  const c = draw("# fn 1\n\nn[^a]\n\n[^a]: note\n")
  const scrolled: string[] = []
  for (const el of c.querySelectorAll<HTMLElement>("[data-markdown-fragment]"))
    el.scrollIntoView = () => void scrolled.push(el.tagName)
  fireEvent.click(c.querySelector("sup a")!)
  expect(scrolled).toEqual(["LI"])
})

test("生の HTML は、描かずに改行を保った文字で見せる", () => {
  const c = draw("<div>\n<b>a</b>\n</div>\n")
  expect(c.querySelector("b")).toBeNull()
  expect(c.querySelector("pre")?.textContent).toBe("<div>\n<b>a</b>\n</div>")
})

test("行き先: # はフラグメントの %xx を戻し、http・https・mailto だけを開く", () => {
  expect(linkTarget("#%E8%A6%8B")).toEqual({ kind: "fragment", fragment: "見" })
  expect(linkTarget("#%E8")).toEqual({ kind: "fragment", fragment: "%E8" })
  expect(linkTarget("HTTPS://x.test")).toEqual({ kind: "open", url: "HTTPS://x.test" })
  expect(linkTarget("data:text/html,x")).toEqual({ kind: "none" })
  expect(linkTarget("")).toEqual({ kind: "none" })
})

test("縮める倍率は、ペインが紙より狭いときだけ 1 より小さい", () => {
  expect(shrinkTo(400, 800)).toBe(0.5)
  expect(shrinkTo(1000, 800)).toBe(1)
  expect(shrinkTo(0, 800)).toBe(1)
})

test("いちばん外のブロックの名前は、原文の中の位置によらず中身と、同じ中身の何番目か", () => {
  const a = blockKeys(parseMarkdown("x\n\ny\n\nx\n").blocks)
  const b = blockKeys(parseMarkdown("new\n\nx\n\ny\n\nx\n").blocks)
  expect(new Set(a).size).toBe(3)
  expect(b.slice(1)).toEqual(a)
})

test("上にブロックを足しても、中身の同じブロックは描き直さず、同じ要素のまま", () => {
  const view = render(<MarkdownDocumentView document={parseMarkdown("# A\n\nbody\n")} />)
  const before = view.container.querySelector("p")
  view.rerender(<MarkdownDocumentView document={parseMarkdown("new\n\n# A\n\nbody\n")} />)
  const ps = view.container.querySelectorAll("p")
  expect(ps).toHaveLength(2)
  expect(ps[1]).toBe(before!)
})
