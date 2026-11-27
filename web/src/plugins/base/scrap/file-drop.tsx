// 外から落としたファイルを、スクラップにして置く: ファイルからページを作れるプレゼンテーション（ビューの定義の拡張ポイント pageFromFile。画像のページなど）の言う形で、
// ファイルをアセットの置き場に置いてページを作り（中身が同じページが開ける所に在れば、作らずにそれを使う）、そのページ全体のスクラップを、開いているページのスクラップフレームのアイテムで、
// 落とした所に置く（大きさはスクラップトレイから置くのと同じく、紙の半分に収める）。どこに置くかは、落とされたビュー（紙・スライドのレイヤー）が決める。
// ファイルが何枚でも、1 枚ずつ作って、落とした所から右へ並べて置く

import type { DragEvent } from "react"
import type { MessageKey } from "../../../core/catalog"
import { freeTitle, titlesIn } from "../../../core/entries"
import { systemFolderOf } from "../../../core/folders-tree"
import type { Point } from "../../../core/geom"
import { openablePage } from "../../../core/library"
import { NO_PAGE, NO_PAPER } from "../../../core/stage"
import { useT } from "../../../ui/i18n"
import { useCatalog, useInstance, useReadState, useUiCatalog } from "../../../ui/store-context"
import { useActions, usePage } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { useReadNaming } from "../library/hooks"
import { PAGE_CREATE } from "../library/page-create"
import { paperSize } from "../place/grow"
import { useCanPlace } from "../toolbox/use-can-place"
import type { PageFromFileDef, PutAsset } from "./page-from-file"
import { useScrapFrame } from "./ScrapTray"
import { type Scrap, scrapSize, scrapToPlace, wholeScrapOf } from "./scrap"

// 何枚も落としたときの、並べたスクラップの間（紙の px）
const DROP_GAP = 8

// 落としたファイル 1 枚から作ったスクラップを置くこと: 開いていたページ page に、アイテム item で項目 props を、ビューが測った落とした所 at から右へ shift（紙の px。前に置いた物の幅とすき間の和）ずらして置く
export interface FileDrop {
  page: string
  item: string
  props: Scrap
  at: Point
  shift: number
}

// ファイルを受けるビュー（紙・スライドのレイヤー）が使う口。atOf は落とした所を、ビューが自分の測り方で読む（紙の外なら NO_PAPER で、置かない）
export function useFileDrop(
  atOf: (e: DragEvent<HTMLElement>) => Point | typeof NO_PAPER,
  place: (drop: FileDrop) => void,
): { onDragOver(e: DragEvent<HTMLElement>): void; onDrop(e: DragEvent<HTMLElement>): void } {
  const catalog = useCatalog().core
  const frame = useScrapFrame()
  const canPlace = useCanPlace()
  const shown = usePage()
  const read = useReadState()
  const { perform } = useActions()
  const naming = useReadNaming()
  const text = useT()
  const takes = (e: DragEvent<HTMLElement>) =>
    frame !== null && canPlace && shown !== NO_PAGE && e.dataTransfer.types.includes("Files")
  const files = useFileAsset()

  // ファイル 1 枚から、ページを作るか在る物を使う。そのページの id（できなければ訳を知らせて NO_PAGE）
  const pageOf = async (file: File): Promise<string | typeof NO_PAGE> => {
    const maker = files.makerOf(file.type)
    if (!maker) {
      files.refuse(file, kit.message("It is not a kind of file that can be placed"))
      return NO_PAGE
    }
    const put = await files.put(file, maker)
    if (put === NO_ASSET) return NO_PAGE
    const state = read()
    const same = Object.keys(state.pages).find(id => {
      const at = openablePage(state, id)
      return at !== undefined && at.page.type === maker.type && maker.same(at.page, put)
    })
    if (same !== undefined) return same
    const into = Object.entries(state.folders).find(([, f]) => systemFolderOf(f) === maker.into)
    if (!into) {
      files.refuse(file, kit.message("It could not be made"))
      return NO_PAGE
    }
    const made = maker.page(file, put, key => text(key))
    const title = freeTitle(made.title, titlesIn(state, into[1], naming()))
    const done = perform(PAGE_CREATE.id, { type: maker.type, ...made, title, folder: into[0] })
    if (done.ok) return (done.result as { page: string }).page
    files.refuse(file, kit.message("It could not be made"))
    return NO_PAGE
  }

  return {
    onDragOver: e => {
      if (!takes(e)) return
      e.preventDefault()
      e.stopPropagation() // 重なったビュー（紙の上のスライドのレイヤーなど）は、上の物だけが受ける
      e.dataTransfer.dropEffect = "copy"
    },
    onDrop: e => {
      if (!takes(e) || frame === null || shown === NO_PAGE) return
      e.preventDefault()
      e.stopPropagation()
      const at = atOf(e)
      if (at === NO_PAPER) return
      const page = shown.id
      const paper = paperSize(catalog, shown)
      const files = [...e.dataTransfer.files]
      void (async () => {
        let shift = 0
        for (const file of files) {
          const made = await pageOf(file)
          const opened = typeof made === "string" ? openablePage(read(), made) : undefined
          if (typeof made !== "string" || !opened) continue
          const props = scrapToPlace(wholeScrapOf(catalog, made, opened.page), paper)
          place({ page, item: frame, props, at, shift })
          shift += scrapSize(props).w + DROP_GAP
        }
      })()
    },
  }
}

// 置き場に置けなかったとき
export const NO_ASSET = "none"

// ファイルからページを作れるプレゼンテーションを探し、ファイルをアセットの置き場に置く（外から落としたファイルを、スクラップにするとき・書庫に取り込むとき）。
// 置けなければ、訳をトーストで知らせて NO_ASSET
export function useFileAsset() {
  const views = useUiCatalog().presentationViews
  const instance = useInstance()
  const { showToast } = useActions()
  const text = useT()
  const refuse = (file: File, why: MessageKey) =>
    showToast({
      kind: "warn",
      message: kit.message("Could not take {name}"),
      params: { name: file.name || text(kit.message("The file")) },
      detail: { message: why },
    })
  return {
    makerOf: (type: string): PageFromFileDef | undefined =>
      [...views.values()].find(v => v.pageFromFile?.accepts(type))?.pageFromFile,
    refuse,
    put: async (file: File, maker: PageFromFileDef): Promise<PutAsset | typeof NO_ASSET> => {
      const put = await instance.putAsset(file).catch(() => null)
      if (put?.ok) return put
      refuse(file, put === null ? kit.message("The server could not take it") : maker.refusal(put.reason))
      return NO_ASSET
    },
  }
}
