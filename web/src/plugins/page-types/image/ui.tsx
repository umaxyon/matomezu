// 画像のプラグインの見た目: 画像のページのアイコン・画像のビュー・取り込むダイアログ
import { definePluginUi } from "../../../plugin-api/ui"
import { IMAGE_PLUGIN } from "."
import { IMAGE, IMAGE_PRESENTATION, IMPORT_IMAGES_DIALOG } from "./image"
import { ImageIcon } from "./type-icon"
import { ImageMeasure, ImageSheet, ImageView, ImportImagesDialog } from "./view/ui"

export const IMAGE_UI = definePluginUi(IMAGE_PLUGIN, {
  pageTypeIcons: { [IMAGE.id]: <ImageIcon /> },
  presentationViews: {
    [IMAGE_PRESENTATION.id]: { view: ImageView, printSheet: ImageSheet, printMeasure: ImageMeasure },
  },
  dialogViews: { [IMPORT_IMAGES_DIALOG.id]: ImportImagesDialog },
})
