// 書庫のフォルダにページを作る関数のうち、名前が重なれば先に利用者に聞く物: 作るページの名前と同じ名前の物がフォルダの直下に在れば、
// 名前が重なったときの確かめ（TitleClashConfirm。番号を付ける・上書きする・やめる）を出し、選んだとおりに作る（番号は、動かす・戻すときと同じ付き方）。
// 1 つずつ聞くので、いくつも続けて作るときは、前の答えを待ってから次を頼む。confirm は、呼んだビューが描く確かめ（聞いていなければ null）

import { type ReactNode, useState } from "react"
import { freeTitle, titledIn, titlesIn } from "../../../core/entries"
import type { AnyEntryRef } from "../../../core/folders"
import { useCatalog, useReadState } from "../../../ui/store-context"
import { useAllowedOn } from "../../../ui/view-hooks"
import { replaceBlockedOf } from "./entries"
import { useNameOf, useReadNaming } from "./hooks"
import { NO_TITLE } from "./outline"
import { PAGE_CREATE_OVER } from "./page-create"
import { TitleClashConfirm } from "./TitleClashConfirm"
import { type CreatePageArgs, useCreatePage } from "./useCreatePage"

interface Asking {
  folder: string
  args: CreatePageArgs & { title: string }
  there: AnyEntryRef
  numbered: string
  done(made: boolean): void
}

export function useCreatePageAsking(folder: string): {
  create(args: CreatePageArgs & { title: string }): Promise<boolean> // 作れたか（やめた・断られたら false）
  confirm: ReactNode
} {
  const { create, confirm } = useCreatePageAskingIn()
  return { create: args => create(folder, args), confirm }
}

// useCreatePageAsking の、作るフォルダ folder を 1 回ずつ受ける物（書庫に落としたファイルのように、作る先が頼むたびに替わるとき）
export function useCreatePageAskingIn(): {
  create(folder: string, args: CreatePageArgs & { title: string }): Promise<boolean>
  confirm: ReactNode
} {
  const create = useCreatePage()
  const read = useReadState()
  const naming = useReadNaming()
  const [asking, setAsking] = useState<Asking | null>(null)
  const ask = (folder: string, args: CreatePageArgs & { title: string }) =>
    new Promise<boolean>(done => {
      const library = read()
      const holder = library.folders[folder]
      const there = holder && titledIn(library, holder, args.title, naming())
      if (!holder || !there) {
        done(create(folder, args))
        return
      }
      setAsking({ folder, args, there, numbered: freeTitle(args.title, titlesIn(library, holder, naming())), done })
    })
  const answer = (made: () => boolean) => {
    if (!asking) return
    setAsking(null)
    asking.done(made())
  }
  const confirm = asking && (
    <CreateClashConfirm
      folder={asking.folder}
      asking={asking}
      onNumber={() => answer(() => create(asking.folder, { ...asking.args, title: asking.numbered }))}
      onReplace={() => answer(() => create(asking.folder, { ...asking.args, replaces: asking.there.id }))}
      onCancel={() => answer(() => false)}
    />
  )
  return { create: ask, confirm }
}

// 作る物と同じ名前の物が在るときの確かめ。上書きは、作る物と同じ種類（バインダにまとまるタイプならバインダ、ほかはページ）の物だけで、
// page-create-over を行えるとき（ロック中・認可ステップが止めるなら選べない）
function CreateClashConfirm({
  folder,
  asking,
  onNumber,
  onReplace,
  onCancel,
}: {
  folder: string
  asking: Asking
  onNumber(): void
  onReplace(): void
  onCancel(): void
}) {
  const read = useReadState()
  const nameOf = useNameOf()
  const catalog = useCatalog().core
  const { replaces: _, ...args } = asking.args
  const allowed = useAllowedOn(PAGE_CREATE_OVER.id, { ...args, folder, replaces: asking.there.id })
  const made = catalog.pageTypes.get(args.type)?.grouping === "binder" ? "binder" : "page"
  const holder = read().folders[folder]
  return (
    <TitleClashConfirm
      folder={nameOf({ id: folder, title: (holder && "title" in holder && holder.title) || NO_TITLE })}
      name={asking.args.title}
      numbered={asking.numbered}
      blocked={replaceBlockedOf({ overwrite: asking.there.kind === made ? "ok" : "kind" }, allowed)}
      onNumber={onNumber}
      onReplace={onReplace}
      onCancel={onCancel}
    />
  )
}
