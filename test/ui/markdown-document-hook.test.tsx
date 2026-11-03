// Markdown の原文を読んだ物を返すフック（base の useMarkdownDocument）: Worker に 1 つずつ頼み、返る前の変更は返ってから最後の物だけを頼む。
// 読む物が替わればその場で読み、Worker が読み込めなければその場で読む。StrictMode で付け直しても 2 回頼まない
import { afterEach, beforeEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { StrictMode } from "react"
import { parseMarkdown } from "../../web/src/plugins/base"
import { useMarkdownDocument } from "../../web/src/plugins/base/ui"

type Message = { id: number; text: string }
let made: FakeWorker[] = []
class FakeWorker {
  posted: Message[] = []
  listeners = new Map<string, ((e: unknown) => void)[]>()
  constructor() {
    made.push(this)
  }
  addEventListener(type: string, f: (e: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), f])
  }
  postMessage(m: Message) {
    this.posted.push(m)
  }
  reply(m: Message) {
    for (const f of this.listeners.get("message") ?? []) f({ data: { id: m.id, document: parseMarkdown(m.text) } })
  }
  fail() {
    for (const f of this.listeners.get("error") ?? []) f({})
  }
}

// Worker のファイルを引く土台の URL（テストの文書は about:blank で、URL を作れない）
const page = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM
const original = globalThis.Worker
beforeEach(() => {
  made = []
  page.setURL("http://localhost/")
  // フックは Worker の型ごとに 1 つ作るので、テストごとに別の型にする
  globalThis.Worker = class extends FakeWorker {} as unknown as typeof Worker
})
afterEach(() => {
  cleanup()
  globalThis.Worker = original
  page.setURL("about:blank")
})

function Probe({ text, of }: { text: string; of: string }) {
  const first = useMarkdownDocument(text, of).blocks[0]
  return <p>{first && "children" in first ? JSON.stringify(first.children.map(c => c.kind)) : ""}</p>
}
const shown = (c: HTMLElement) => c.querySelector("p")?.textContent

test("開いたときはその場で読み、変更は Worker に頼む。返る前に 2 回変えたら、返ってから最後の物だけを頼む", () => {
  const view = render(<Probe text="a" of="p1" />)
  expect(shown(view.container)).toBe('["text"]')
  view.rerender(<Probe text="**b**" of="p1" />)
  view.rerender(<Probe text="*c*" of="p1" />)
  view.rerender(<Probe text="`d`" of="p1" />)
  const w = made.at(-1)!
  expect(w.posted.map(m => m.text)).toEqual(["**b**"])
  // 返るまでは前に読んだ物
  expect(shown(view.container)).toBe('["text"]')
  act(() => w.reply(w.posted[0]!))
  expect(w.posted.map(m => m.text)).toEqual(["**b**", "`d`"])
  act(() => w.reply(w.posted[1]!))
  expect(shown(view.container)).toBe('["inlineCode"]')
})

test("読む物が替わったら、返りを待たずにその場で読む。前の物への返りは使わない", () => {
  const view = render(<Probe text="a" of="p1" />)
  view.rerender(<Probe text="**b**" of="p1" />)
  view.rerender(<Probe text="*c*" of="p2" />)
  expect(shown(view.container)).toBe('["emphasis"]')
  const w = made.at(-1)!
  act(() => w.reply(w.posted[0]!))
  expect(shown(view.container)).toBe('["emphasis"]')
})

test("Worker を読み込めなければ、それからはその場で読む", () => {
  const view = render(<Probe text="a" of="p1" />)
  const w = made.at(-1)!
  act(() => w.fail())
  view.rerender(<Probe text="**b**" of="p1" />)
  expect(shown(view.container)).toBe('["strong"]')
  expect(w.posted).toEqual([])
})

test("StrictMode で付け直しても、1 つの変更に頼むのは 1 回で、返った物を使う", () => {
  const view = render(
    <StrictMode>
      <Probe text="a" of="p1" />
    </StrictMode>,
  )
  view.rerender(
    <StrictMode>
      <Probe text="**b**" of="p1" />
    </StrictMode>,
  )
  const w = made.at(-1)!
  expect(w.posted.map(m => m.text)).toEqual(["**b**"])
  act(() => w.reply(w.posted[0]!))
  expect(shown(view.container)).toBe('["strong"]')
})
