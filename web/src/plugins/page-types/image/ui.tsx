// 画像のプラグインの見た目: 画像のページのアイコン・画像のビュー（と紙の画面の右クリックのメニュー）・取り込むダイアログ
import { definePluginUi } from "../../../plugin-api/ui"
import { IMAGE_PLUGIN } from "."
import { IMAGE, IMAGE_CONTEXT, IMAGE_PRESENTATION, IMAGES, IMPORT_IMAGES_DIALOG } from "./image"
import { ImageIcon, ImagesFolderIcon } from "./type-icon"
import { ImageScrap, ImageSheet, ImageView, ImportImagesDialog } from "./view/ui"

export const IMAGE_UI = definePluginUi(IMAGE_PLUGIN, {
  pageTypeIcons: { [IMAGE.id]: <ImageIcon /> },
  systemFolderIcons: { [IMAGES.id]: <ImagesFolderIcon /> },
  presentationViews: {
    [IMAGE_PRESENTATION.id]: {
      view: ImageView,
      printSheet: ImageSheet,
      scrapView: ImageScrap,
      contextMenus: [IMAGE_CONTEXT],
    },
  },
  dialogViews: { [IMPORT_IMAGES_DIALOG.id]: ImportImagesDialog },
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/image:image-context": Record<string, never> // 紙の画面（何も受け取らない）
  }
}
