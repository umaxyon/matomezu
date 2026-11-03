// Markdown の原文を読んだ物（MarkdownDocument）を返すフック: 開いたとき・読む物（of。ページなど）が替わったときはその場で読み、
// そのあとの変更は Web Worker（markdown-parse-worker.ts）で読む（書くのを待たせない）。読んでいる間は前に読んだ物を返す。
// 頼むのは 1 つずつで、返る前に変わった原文は、返ってから最後の物だけを頼む。外したあとに返った物は使わない。
// Worker を使えない（無い・読み込めない。file:// で開いたときなど）なら、その場で読む（React の遅らせた値で、書くのを先にする）。どちらで読んでいるかも返す
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import type { ParseReply, ParseRequest } from "./markdown-parse-worker"
import { type MarkdownDocument, parseMarkdown } from "./parse"

export type ParsedBy = "worker" | "here"

// 画面のビルドが出す Worker のファイル（scripts/web-build.ts）
const WORKER_FILE = "markdown-parse-worker.js"

// 窓に 1 つの Worker（作れなければ "none"）と、返りを待っている頼み（id → 受ける関数）。読み込めないと分かったら、それからはその場で読む
let shared: { made: Worker | "none"; by: typeof Worker | undefined } | undefined
const waiting = new Map<number, (document: MarkdownDocument) => void>()
const failed = new Set<() => void>()
let ids = 0

function worker(): Worker | "none" {
  const by = typeof Worker === "undefined" ? undefined : Worker
  if (shared && shared.by === by) return shared.made
  shared = { made: "none", by }
  if (by === undefined || typeof document === "undefined") return shared.made
  try {
    const made = new by(new URL(WORKER_FILE, document.baseURI), { type: "module" })
    made.addEventListener("message", (e: MessageEvent<ParseReply>) => {
      const take = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      take?.(e.data.document)
    })
    made.addEventListener("error", () => {
      if (shared) shared.made = "none"
      waiting.clear()
      for (const f of failed) f()
    })
    shared.made = made
  } catch {
    shared.made = "none"
  }
  return shared.made
}

type Read = { of: string; text: string; document: MarkdownDocument }

export function useMarkdownDocument(text: string, of: string): { document: MarkdownDocument; by: ParsedBy } {
  const [by, setBy] = useState<ParsedBy>(() => (worker() === "none" ? "here" : "worker"))
  const [read, setRead] = useState<Read>(() => ({ of, text, document: parseMarkdown(text) }))
  // 読む物が替わったら、その場で読み直す
  const now = read.of === of ? read : { of, text, document: parseMarkdown(text) }
  if (now !== read) setRead(now)
  const deferred = useDeferredValue(text)
  const here = useMemo(
    () => (by === "here" && deferred !== now.text ? parseMarkdown(deferred) : now.document),
    [by, deferred, now],
  )
  // 返りを待っている頼みの id（待っていなければ idle）
  const asked = useRef<number | "idle">("idle")
  useEffect(() => {
    const fail = () => {
      asked.current = "idle"
      setBy("here")
    }
    failed.add(fail)
    return () => {
      failed.delete(fail)
      if (asked.current !== "idle") waiting.delete(asked.current)
      asked.current = "idle"
    }
  }, [])
  useEffect(() => {
    const w = worker()
    if (by !== "worker" || w === "none" || asked.current !== "idle" || text === now.text) return
    const id = ++ids
    const askedOf = now.of
    waiting.set(id, document => {
      asked.current = "idle"
      setRead(r => (r.of === askedOf ? { of: askedOf, text, document } : { ...r }))
    })
    asked.current = id
    w.postMessage({ id, text } satisfies ParseRequest)
  }, [by, text, now])
  return { document: by === "here" ? here : now.document, by }
}
