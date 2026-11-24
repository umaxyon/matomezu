// 呼んだ AI の作業机（ホストのエンジンが読む。AI の read_folder と参加の文に出す）と、ワークルームのワーカーブックの実のブックを引く所（書庫の画面の作業机 workdesks.ts と同じ引き方）
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Folders } from "../../../core/folders"
import { systemFolderOf } from "../../../core/folders-tree"
import { type RecordReader, type RecordSource, readerOf } from "../../../core/record-source"
import { MY_WORKDESK, WORKROOMS } from "../library/system-folders"
import { workroomWorkIn } from "./activity"
import { type FoundWorkerBook, foundWorkerBookOf, NO_WORKER_BOOK, workerBookOf, workerBookReadsOf } from "./worker-book"
import { WORKER_PAGE_ADD } from "./worker-page-add"

// ワークルーム room のワーカーブックの名前 title と、在るワーカーブック found（まだ無ければ NO_WORKER_BOOK）。read は workerBookReadsOf の種類を読める読み口
export function workerBookIn(
  catalog: CoreCatalog,
  read: RecordReader,
  folders: Folders,
  room: string,
): { title: string; found: FoundWorkerBook | typeof NO_WORKER_BOOK } {
  const { workKey, title } = workerBookOf(catalog, read, room)
  return { title, found: foundWorkerBookOf(folders, workKey) }
}

// 呼んだ AI のワークルーム room の作業机（ホストのエンジンが読む。AI の read_folder と参加の文に出す）:
// ワークルームのフォルダの id（無ければ undefined）、ワーカーブックの id（まだ無ければ undefined）とそのページの数、参加の文に足す英語の文 forAi（空きのワークルームなら、作業を答える種類の forAi も）
export interface MyWorkdesk {
  workrooms: string | undefined
  book: string | undefined
  pages: number
  forAi: string
}

// 常駐の読み口 source と書庫の表 folders から、ワークルーム room の MyWorkdesk
export function myWorkdeskIn(catalog: CoreCatalog, source: RecordSource, folders: Folders, room: string): MyWorkdesk {
  const read = readerOf(catalog, source, workerBookReadsOf(catalog))
  const { found } = workerBookIn(catalog, read, folders, room)
  const workrooms = Object.values(folders).find(f => systemFolderOf(f) === WORKROOMS.id)?.id
  const book = found === NO_WORKER_BOOK ? undefined : found.book
  const pages = found === NO_WORKER_BOOK ? 0 : found.pages.length
  const where =
    book === undefined
      ? `Your worker book has no pages yet: add one with ${WORKER_PAGE_ADD.id}.`
      : `Your worker book (the book of your current work) is ${book}, with ${pages} page${pages === 1 ? "" : "s"}: read it with read_book.`
  const work = workroomWorkIn(catalog, read, room)
  const idle = work !== "unknown" && work.kind === "idle" && work.forAi ? ` ${work.forAi}` : ""
  return {
    workrooms,
    book,
    pages,
    forAi: `${where}${idle} It changes when your current work changes, so do not keep the book's id: write down the ids of pages. read_folder with folder "${MY_WORKDESK}" shows it.`,
  }
}
