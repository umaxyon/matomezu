// ページを作るダイアログのフック: ダイアログが受けた値 args（NewPageDialogArgs）から、作る先を決めて、
// 紙を選ぶ並び（lineup）と所（place）・初めに入れておく名前（titles）・作る関数（add）を返す。
// 作る先は、args.folder を書いていれば書庫のそのフォルダ（書庫ホーム・フォルダ・ブック・ブックの外のバインダ。アクション page-create で作り、書庫の画面でそれを選ぶ）、
// 書いていなければ、描いている場所のステージが開いているブック（アクション page-add で足し、そのステージで開く）
import { useMemo } from "react"
import { lineupOf, pagesIn } from "../../../core/book"
import { freeTitle, titlesIn } from "../../../core/entries"
import { outsideBinderIn } from "../../../core/folders-tree"
import type { ArgsOf } from "../../../core/perform"
import type { StageLineup } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useBook } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { useReadNaming } from "../library/hooks"
import { useCreatePage } from "../library/useCreatePage"
import type { PAGE_ADD } from "../pages/page-add"
import { nextPageTitle, type PaperPlace } from "../pages/pages"
import type { NewPageDialogArgs } from "."
import { useAddPage } from "./useAddPage"

export interface NewPage {
  lineup: StageLineup | null // 紙の規定と選択肢を出す並び（ブックか、ブックの外のバインダ 1 つの並び。書庫ホームとフォルダは空の並び）。作る先が無ければ null
  place: PaperPlace // 並びの中の入れる所（今あるバインダ・新しいバインダ・並び）
  // 初めに入れておく名前（作る先の名前と重ならない）: page はページ、binder は新しく作るバインダ
  titles: { page: string; binder: string }
  add(args: ArgsOf<typeof PAGE_ADD.id>): boolean // 作れたか
}

export function useNewPage(args: NewPageDialogArgs): NewPage {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const { folder } = args
  const staged = useBook()
  const book = useMatomezuState(s => (folder === undefined ? null : (s.books[folder] ?? null)))
  const binder = useMatomezuState(s => (folder === undefined ? null : (outsideBinderIn(s, folder) ?? null)))
  const held = useMatomezuState(s => (folder === undefined ? null : (s.folders[folder] ?? null)))
  const read = useReadState()
  const naming = useReadNaming()
  const addToStage = useAddPage()
  const create = useCreatePage()
  const type = catalog.pageTypes.get(args.type)
  // 書庫ホーム・フォルダは、何も並んでいない並びで紙を選ぶ
  const empty = useMemo((): StageLineup | null => (folder === undefined ? null : { id: folder, lineup: [] }), [folder])
  const intoFolder = folder !== undefined && held !== null && held.folderRole !== "book" && held.folderRole !== "binder"
  const lineup =
    folder === undefined ? staged : (book ?? (binder ? { id: binder.id, lineup: [binder] } : intoFolder ? empty : null))
  const into = folder === undefined ? args.binder : binder?.id
  const place: PaperPlace =
    into !== undefined ? { binder: into } : type?.grouping === "binder" ? "new-binder" : "lineup"
  // 作る先に並ぶ名前（書庫ホーム・フォルダはその直下のエントリ、ブックはその並び）
  const taken = (): string[] =>
    intoFolder && held ? titlesIn(read(), held, naming()) : lineup ? lineupOf(lineup).map(e => e.title) : []
  const inBinder = lineup && into !== undefined ? pagesIn(lineup, into).map(p => p.title) : undefined
  const none: StageLineup = { id: "", lineup: [] }
  return {
    lineup,
    place,
    titles: {
      page: nextPageTitle(lineup ?? none, t, place === "new-binder" ? [] : (inBinder ?? taken())),
      binder: freeTitle(type ? t(type.title) : "", taken()),
    },
    add: page => (folder === undefined ? addToStage(page) : create(folder, page)),
  }
}
