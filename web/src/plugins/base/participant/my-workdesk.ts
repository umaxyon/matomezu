// 呼んだ AI の作業机（ホストのエンジンが読む。AI の read_folder と参加の文に出す）と、ワークルームのワーカーブックの実のブックを引く所（書庫の画面の作業机 workdesks.ts と同じ引き方）
import type { CoreCatalog } from "../../../core/core-catalog"
import { backyardBookOf, rowsWithin } from "../../../core/entries"
import type { Folders } from "../../../core/folders"
import { systemFolderOf } from "../../../core/folders-tree"
import { type RecordReader, type RecordSource, readerOf } from "../../../core/record-source"
import { TICKETS_HISTORY } from "../library/backyards"
import { MY_WORKDESK, WORKROOMS } from "../library/system-folders"
import { workerBookOf, workerBookReadsOf } from "./worker-book"
import { WORKER_PAGE_ADD } from "./worker-page-add"

// ワークルーム room のワーカーブックの名前 title と、実のブックの id book（まだ無ければ undefined）。read は workerBookReadsOf の種類を読める読み口
export function workerBookIn(
  catalog: CoreCatalog,
  read: RecordReader,
  folders: Folders,
  room: string,
): { title: string; book: string | undefined } {
  const { workKey, title } = workerBookOf(catalog, read, room)
  return { title, book: backyardBookOf({ folders }, TICKETS_HISTORY.id, workKey) }
}

// 呼んだ AI のワークルーム room の作業机（ホストのエンジンが読む。AI の read_folder と参加の文に出す）:
// ワークルームのフォルダの id（無ければ undefined）、ワーカーブックの id（まだ無ければ undefined）とそのページの数、参加の文に足す英語の文 forAi
export interface MyWorkdesk {
  workrooms: string | undefined
  book: string | undefined
  pages: number
  forAi: string
}

// 常駐の読み口 source と書庫の表 folders から、ワークルーム room の MyWorkdesk
export function myWorkdeskIn(catalog: CoreCatalog, source: RecordSource, folders: Folders, room: string): MyWorkdesk {
  const read = readerOf(catalog, source, workerBookReadsOf(catalog))
  const { book } = workerBookIn(catalog, read, folders, room)
  const workrooms = Object.values(folders).find(f => systemFolderOf(f) === WORKROOMS.id)?.id
  // ページの数は、ブックの中のページの全部（バインダの中も。ownBookPagesOf と同じ数え方）
  const pages = book === undefined ? 0 : rowsWithin(folders, book).pages.length
  const where =
    book === undefined
      ? `Your worker book has no pages yet: add one with ${WORKER_PAGE_ADD.id}.`
      : `Your worker book (the book of your current work) is ${book}, with ${pages} page${pages === 1 ? "" : "s"}: read it with read_book.`
  return {
    workrooms,
    book,
    pages,
    forAi: `${where} It changes when your current work changes, so write down the ids of pages, not of the book. read_folder with folder "${MY_WORKDESK}" shows it.`,
  }
}
