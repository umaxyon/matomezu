// 読んだブック（JSON）の手伝い。e2e が初めに置くブックは、test/sample-books.ts の SAMPLE_BOOKS

// 読んだブック（JSON）の並びのページ（バインダの中も、並びの順に）
type Entry = { kind: string; id: string; lineup?: readonly Entry[] } & Record<string, unknown>
export const pagesIn = <P = Entry>(book: { lineup: readonly unknown[] }): P[] =>
  (book.lineup as readonly Entry[]).flatMap(e => (e.kind === "binder" ? (e.lineup ?? []) : [e])) as P[]

// 読んだブック（JSON）の、id のページ
export const pageIn = <P = Entry>(book: { lineup: readonly unknown[] }, id: string): P | undefined =>
  pagesIn<P & { id: string }>(book).find(p => p.id === id)
