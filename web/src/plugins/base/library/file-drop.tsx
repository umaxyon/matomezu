// 書庫に外から落としたファイルを取り込む: ファイルからページを作れるプレゼンテーション（ビューの定義の pageFromFile）が言うシステムフォルダ（画像のページなら「画像」）と
// その下のフォルダに落とすと、そこに 1 枚 1 ページで作る（名前が重なれば、取り込みのダイアログと同じく 1 件ずつ確かめる）。重ねている行は色を付ける。
// その外では、ポインタを禁止の印にし、落とす所を知らせるトーストを 1 回のドラッグにつき 1 度出す（禁止の印の所には、落とした事が届かないので、重ねたときに知らせる）

import { type DragEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { foldersOver, systemFolderOf } from "../../../core/folders-tree"
import { useT } from "../../../ui/i18n"
import { useCatalog, useReadState } from "../../../ui/store-context"
import { useActions } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { NO_ASSET, useFileAsset } from "../scrap/file-drop"
import type { PageFromFileDef } from "../scrap/page-from-file"
import { useCreatePageAskingIn } from "./useCreatePageAsking"

type Handlers = {
  onDragOver(e: DragEvent<HTMLElement>): void
  onDragLeave(e: DragEvent<HTMLElement>): void
  onDrop(e: DragEvent<HTMLElement>): void
  "data-drop"?: "into"
}

export interface LibraryFileDrop {
  on(folder: string): Handlers // 書庫の行（と、開いているフォルダの中身）に付ける。folder はそこに落とすと入る所
  confirm: ReactNode // 名前が重なったときの確かめ（聞いていなければ null）
}

const filesOf = (e: DragEvent<HTMLElement>) => [...e.dataTransfer.items].filter(i => i.kind === "file")

export function useLibraryFileDrop(): LibraryFileDrop {
  const read = useReadState()
  const catalog = useCatalog().core
  const { showToast } = useActions()
  const text = useT()
  const files = useFileAsset()
  const { create, confirm } = useCreatePageAskingIn()
  const [over, setOver] = useState<string | null>(null)
  const warned = useRef(false)
  // 1 回のドラッグが終わったら（窓の外へ出た・どこかに落とした）、また知らせる
  useEffect(() => {
    const ended = (e: globalThis.DragEvent) => {
      if (e.type === "drop" || e.relatedTarget === null) {
        warned.current = false
        setOver(null)
      }
    }
    window.addEventListener("dragleave", ended)
    window.addEventListener("drop", ended, true)
    return () => {
      window.removeEventListener("dragleave", ended)
      window.removeEventListener("drop", ended, true)
    }
  }, [])
  // フォルダ folder が、maker の作る所（システムフォルダ）かその下か
  const takes = (folder: string, maker: PageFromFileDef | undefined): boolean => {
    if (!maker) return false
    const folders = read().folders
    const f = folders[folder]
    return (
      f?.folderRole === "folder" &&
      (systemFolderOf(f) === maker.into || foldersOver(folders, folder).some(o => systemFolderOf(o) === maker.into))
    )
  }
  const warn = (makers: readonly (PageFromFileDef | undefined)[]) => {
    if (warned.current) return
    warned.current = true
    const into = makers.find(m => m !== undefined)?.into
    const title = into === undefined ? undefined : catalog.systemFolders.get(into)?.title
    showToast(
      title === undefined
        ? { kind: "warn", message: kit.message("It is not a kind of file that can be placed") }
        : { kind: "warn", message: kit.message("Drop it in the {folder} folder"), params: { folder: text(title) } },
    )
  }
  const importAll = async (folder: string, dropped: readonly File[]) => {
    for (const file of dropped) {
      const maker = files.makerOf(file.type)
      if (!maker) {
        files.refuse(file, kit.message("It is not a kind of file that can be placed"))
        continue
      }
      if (!takes(folder, maker)) continue
      const put = await files.put(file, maker)
      if (put === NO_ASSET) continue
      await create(folder, { type: maker.type, ...maker.page(file, put, key => text(key)) })
    }
  }
  return {
    on: folder => ({
      onDragOver: e => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        e.stopPropagation()
        const makers = filesOf(e).map(i => files.makerOf(i.type))
        if (makers.some(m => takes(folder, m))) {
          e.dataTransfer.dropEffect = "copy"
          if (over !== folder) setOver(folder)
          return
        }
        e.dataTransfer.dropEffect = "none"
        if (over === folder) setOver(null)
        warn(makers)
      },
      onDragLeave: e => {
        if (over === folder && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
      },
      onDrop: e => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        e.stopPropagation()
        setOver(null)
        void importAll(folder, [...e.dataTransfer.files])
      },
      ...(over === folder ? { "data-drop": "into" as const } : {}),
    }),
    confirm,
  }
}
