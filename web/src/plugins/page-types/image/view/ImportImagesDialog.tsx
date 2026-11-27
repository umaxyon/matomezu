// 画像を取り込むダイアログ: 開くとすぐに OS のファイルを選ぶ窓を開き（いくつも選べる）、選んだファイルを 1 枚 1 ページで、受けたフォルダに取り込む。
// 1 枚ずつ、バイト列をホストのアセットの置き場に置いてから（アクションの外）、そのアセットを指す画像のページを base の page-create で作る。
// 名前はファイル名から拡張子を取った物で、同じ名前の物がフォルダに在れば、1 件ずつ名前が重なったときの確かめを出す（base の useCreatePageAsking）。
// 向きは画像の縦横（横長なら横、ほかは縦）。受けない画像は、ファイルごとに訳をトーストに出して飛ばす。選ぶのをやめたら閉じる
import { useEffect, useRef } from "react"
import type { MessageKey, NewPageDialogArgs } from "../../../../plugin-api"
import { type DialogProps, useActions, useMessages } from "../../../../plugin-api/ui"
import { useCreatePageAsking, useImportAsset } from "../../../base/ui"
import { IMAGE } from "../image"
import { kit } from "../kit"
import { IMAGE_TYPES, putRefusal, titleOfFile } from "./from-file"

// 取り込むファイルの種類（中身で見分けるのはホスト）
const ACCEPT = IMAGE_TYPES.join(",")

export function ImportImagesDialog({ args, onClose }: DialogProps<NewPageDialogArgs>) {
  const input = useRef<HTMLInputElement>(null)
  const opened = useRef(false)
  const t = useMessages(kit)
  const put = useImportAsset()
  const { showToast } = useActions()
  const { create, confirm } = useCreatePageAsking(args.folder ?? "")
  useEffect(() => {
    const el = input.current
    el?.addEventListener("cancel", onClose)
    return () => el?.removeEventListener("cancel", onClose)
  }, [onClose])
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    if (args.folder === undefined) onClose()
    else input.current?.click()
  }, [args.folder, onClose])
  const importAll = async (files: readonly File[]) => {
    for (const file of files) {
      const name = file.name
      const refused = (detail: MessageKey) =>
        showToast({
          kind: "warn",
          message: kit.message("Could not import {name}"),
          params: { name },
          detail: { message: detail },
        })
      const done = await put(file).catch(() => null)
      if (!done) {
        refused(kit.message("The server could not take it"))
        continue
      }
      if (!done.ok) {
        refused(putRefusal(done.reason))
        continue
      }
      await create({
        type: IMAGE.id,
        title: titleOfFile(file.name) || t("Image"),
        orientation: done.width > done.height ? "landscape" : "portrait",
        fields: { asset: done.asset, width: done.width, height: done.height },
      })
    }
    onClose()
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        data-import-images=""
        onChange={e => {
          const files = [...(e.currentTarget.files ?? [])]
          if (files.length === 0) onClose()
          else void importAll(files)
        }}
      />
      {confirm}
    </>
  )
}
