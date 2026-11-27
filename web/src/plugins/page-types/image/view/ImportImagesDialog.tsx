// 画像を取り込むダイアログ: 開くとすぐに OS のファイルを選ぶ窓を開き（いくつも選べる）、選んだファイルを 1 枚 1 ページで、受けたフォルダに取り込む。
// 1 枚ずつ、バイト列をホストのアセットの置き場に置いてから（アクションの外）、そのアセットを指す画像のページを base の page-create で作る。
// 名前はファイル名から拡張子を取った物で、同じ名前の物がフォルダに在れば、1 件ずつ名前が重なったときの確かめを出す（base の useCreatePageAsking）。
// 向きは画像の縦横（横長なら横、ほかは縦）。受けない画像は、ファイルごとに訳をトーストに出して飛ばす。選ぶのをやめたら閉じる
import { useEffect, useRef } from "react"
import type { NewPageDialogArgs } from "../../../../plugin-api"
import { type DialogProps, useActions, useMessages } from "../../../../plugin-api/ui"
import { useCreatePageAsking, useImportAsset } from "../../../base/ui"
import { IMAGE } from "../image"
import { kit } from "../kit"

// 取り込むファイルの種類（中身で見分けるのはホスト）
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml"

// ファイル名から拡張子を取った名前（残らなければ、タイプの名前）
const titleOf = (file: File, fallback: string): string => file.name.replace(/\.[^.]+$/, "").trim() || fallback

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
      const refused = (detail: Parameters<typeof kit.message>[0]) =>
        showToast({
          kind: "warn",
          message: kit.message("Could not import {name}"),
          params: { name },
          detail: { message: kit.message(detail) },
        })
      const done = await put(file).catch(() => null)
      if (!done) {
        refused("The server could not take it")
        continue
      }
      if (!done.ok) {
        refused(
          done.reason === "too-large"
            ? "It is larger than 25MB"
            : "It is not an image that can be imported (PNG, JPEG, GIF, WebP, SVG)",
        )
        continue
      }
      await create({
        type: IMAGE.id,
        title: titleOf(file, t("Image")),
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
