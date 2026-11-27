// 画像のプラグインの見た目: 画像のページのアイコン・画像のビュー（と紙の画面の右クリックのメニュー・ファイルからページを作る口）・取り込むダイアログ
import { definePluginUi } from "../../../plugin-api/ui"
import { IMAGE_PLUGIN } from "."
import { IMAGE, IMAGE_CONTEXT, IMAGE_PRESENTATION, IMPORT_IMAGES_DIALOG } from "./image"
import { ImageIcon } from "./type-icon"
import { IMAGE_FROM_FILE, ImageScrap, ImageSheet, ImageView, ImportImagesDialog } from "./view/ui"

export const IMAGE_UI = definePluginUi(IMAGE_PLUGIN, {
  pageTypeIcons: { [IMAGE.id]: <ImageIcon /> },
  presentationViews: {
    [IMAGE_PRESENTATION.id]: {
      view: ImageView,
      printSheet: ImageSheet,
      scrapView: ImageScrap,
      pageFromFile: IMAGE_FROM_FILE,
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
