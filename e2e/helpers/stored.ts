import type { APIRequestContext } from "@playwright/test"

// 置いてあるブックの全部（並びにページとバインダの中身ごと持つ形。ゴミ箱のブックも。テストの用意の口が組んで返す）
// biome-ignore lint/suspicious/noExplicitAny: 読んだ JSON を、テストごとの形で読む
export const storedBooks = async (request: APIRequestContext): Promise<any[]> =>
  (await (await request.get("/api/books-for-test")).json()).books

// 置いてあるブック id（無ければ undefined）
export const storedBook = async (request: APIRequestContext, id: string) =>
  (await storedBooks(request)).find(b => b.id === id)

// 置いてあるページ id の版（無ければ undefined。ページを変えるたびに 1 つ上がる）
export const storedPageVersion = async (request: APIRequestContext, id: string): Promise<number | undefined> =>
  ((await (await request.get("/api/data")).json()).pages as { id: string; version: number }[]).find(p => p.id === id)
    ?.version

// ゴミ箱の直下の物 id を、ゴミ箱に入れた時刻（ゴミ箱の直下に無ければ undefined）
export const storedTrashedAt = async (request: APIRequestContext, id: string): Promise<string | undefined> => {
  const folders = (await (await request.get("/api/data")).json()).folders as {
    id: string
    folder: { lineup: { id: string; trashed?: string }[] }
  }[]
  return folders.find(f => f.id === "library-trash")?.folder.lineup.find(r => r.id === id)?.trashed
}
