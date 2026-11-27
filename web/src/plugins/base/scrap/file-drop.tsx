// 外から落としたファイルを、スクラップにして置く: ファイルからページを作れるプレゼンテーション（ビューの定義の拡張ポイント pageFromFile。画像のページなど）がページを作り、
// そのページ全体のスクラップを、開いているページのスクラップフレームのアイテムで、落とした所に置く（大きさはスクラップトレイから置くのと同じく、紙の半分に収める）。
// どこに置くかは、落とされたビュー（紙・スライドのレイヤー）が決める。ファイルが何枚でも、1 枚ずつ作って、落とした所から右へ並べて置く

import type { DragEvent } from "react"
import { freeTitle, titlesIn } from "../../../core/entries"
import { openablePage } from "../../../core/library"
import { NO_PAGE } from "../../../core/stage"
import { useT } from "../../../ui/i18n"
import { useCatalog, useInstance, useReadState, useUiCatalog } from "../../../ui/store-context"
import { useActions, usePage } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { useReadNaming } from "../library/hooks"
import { PAGE_CREATE } from "../library/page-create"
import { paperSize } from "../place/grow"
import { useCanPlace } from "../toolbox/use-can-place"
import type { PageFromFileUse } from "./page-from-file"
import { useScrapFrame } from "./ScrapTray"
import { type Scrap, scrapSize, scrapToPlace, wholeScrapOf } from "./scrap"

// 何枚も落としたときの、並べたスクラップの間（紙の px）
const DROP_GAP = 8

// ファイルを受けるビュー（紙・スライドのレイヤー）が使う口。at は落とした所を、ビューが自分で読む形（紙ならポインタ）。
// place は、作ったスクラップの項目 props を、アイテム item で、at から右へ shift（紙の px。前に置いた物の幅とすき間の和）ずらした所に置く
export function useFileDrop<At>(
  atOf: (e: DragEvent<HTMLElement>) => At | null,
  place: (item: string, props: Scrap, at: At, shift: number, page: string) => void,
): { onDragOver(e: DragEvent<HTMLElement>): void; onDrop(e: DragEvent<HTMLElement>): void } {
  const catalog = useCatalog().core
  const views = useUiCatalog().presentationViews
  const frame = useScrapFrame()
  const canPlace = useCanPlace()
  const shown = usePage()
  const read = useReadState()
  const { perform, showToast } = useActions()
  const instance = useInstance()
  const naming = useReadNaming()
  const text = useT()
  const takes = (e: DragEvent<HTMLElement>) =>
    frame !== null && canPlace && shown !== NO_PAGE && e.dataTransfer.types.includes("Files")
  const makerOf = (type: string) => [...views.values()].find(v => v.pageFromFile?.accepts(type))?.pageFromFile
  const use: PageFromFileUse = {
    catalog,
    get folders() {
      return read().folders
    },
    findPage: match => {
      const state = read()
      const found = Object.keys(state.pages).find(id => {
        const at = openablePage(state, id)
        return at !== undefined && match(at.page)
      })
      return found ?? null
    },
    putAsset: bytes => instance.putAsset(bytes),
    createPage: (folder, args) => {
      const library = read()
      const holder = library.folders[folder]
      const title = holder ? freeTitle(args.title, titlesIn(library, holder, naming())) : args.title
      const done = perform(PAGE_CREATE.id, { ...args, title, folder })
      if (done.ok) return (done.result as { page: string }).page
      use.refuse(args.title, kit.message("It could not be made"))
      return null
    },
    text,
    refuse: (file, why) =>
      showToast({
        kind: "warn",
        message: kit.message("Could not take {name}"),
        params: { name: file },
        detail: { message: why },
      }),
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
      if (at === null) return
      const page = shown.id
      const paper = paperSize(catalog, shown)
      const files = [...e.dataTransfer.files]
      void (async () => {
        let shift = 0
        for (const file of files) {
          const maker = makerOf(file.type)
          if (!maker) {
            use.refuse(file.name, kit.message("It is not a kind of file that can be placed"))
            continue
          }
          const made = await maker.make(file, use).catch(() => null)
          const opened = made === null ? undefined : openablePage(read(), made)
          if (made === null || !opened) continue
          const scrap = scrapToPlace(wholeScrapOf(catalog, made, opened.page), paper)
          place(frame, scrap, at, shift, page)
          shift += scrapSize(scrap).w + DROP_GAP
        }
      })()
    },
  }
}
