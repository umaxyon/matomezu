// 原文を読んだ物（MarkdownDocument）を返すフック: 開いたときはその場で読み、そのあとの変更は Web Worker（markdown-parse-worker.ts）で読む（書くのを待たせない）。
// 読んでいる間は前に読んだ物を返す。頼むのは 1 つずつで、返る前に変わった原文は、返ってから最後の物だけを頼む。
// Worker を使えない（無い・読み込めない。file:// で開いたときなど）なら、その場で読む（React の遅らせた値で、書くのを先にする）。どちらで読んでいるかも返す
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { type MarkdownDocument, parseMarkdown } from "../../../base"
import type { ParseReply, ParseRequest } from "../markdown-parse-worker"

export type ParsedBy = "worker" | "here"

const WORKER_FILE = "markdown-parse-worker.js"

// 窓に 1 つの Worker（作れなければ "none"）。読み込めないと分かったら、それからはその場で読む
let shared: Worker | "none" | undefined
const failed = new Set<() => void>()
function worker(): Worker | "none" {
  if (shared !== undefined) return shared
  if (typeof Worker === "undefined" || typeof document === "undefined") {
    shared = "none"
    return shared
  }
  try {
    const made = new Worker(new URL(WORKER_FILE, document.baseURI), { type: "module" })
    made.addEventListener("error", () => {
      shared = "none"
      for (const f of failed) f()
    })
    shared = made
  } catch {
    shared = "none"
  }
  return shared
}

let ids = 0

export function useParsed(text: string): { document: MarkdownDocument; by: ParsedBy } {
  const [by, setBy] = useState<ParsedBy>(() => (worker() === "none" ? "here" : "worker"))
  const [read, setRead] = useState(() => ({ text, document: parseMarkdown(text) }))
  const deferred = useDeferredValue(text)
  const here = useMemo(
    () => (by === "here" && deferred !== read.text ? parseMarkdown(deferred) : read.document),
    [by, deferred, read],
  )
  useEffect(() => {
    const fail = () => setBy("here")
    failed.add(fail)
    return () => void failed.delete(fail)
  }, [])
  // 頼んで返りを待っている id（待っていなければ idle）
  const [asked, setAsked] = useState<number | "idle">("idle")
  useEffect(() => {
    const w = worker()
    if (by !== "worker" || w === "none" || asked !== "idle" || text === read.text) return
    const id = ++ids
    const onReply = (e: MessageEvent<ParseReply>) => {
      if (e.data.id !== id) return
      w.removeEventListener("message", onReply)
      setRead({ text, document: e.data.document })
      setAsked("idle")
    }
    w.addEventListener("message", onReply)
    w.postMessage({ id, text } satisfies ParseRequest)
    setAsked(id)
  }, [by, text, read.text, asked])
  return { document: by === "here" ? here : read.document, by }
}
