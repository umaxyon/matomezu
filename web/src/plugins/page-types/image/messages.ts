// 画像のプラグインの文言
import { defineMessages } from "../../../plugin-api"

export const IMAGE_MESSAGES = defineMessages({
  Image: { en: "Image", ja: "画像" },
  Images: { en: "Images", ja: "画像" },
  "Import images…": { en: "Import images…", ja: "画像を取り込む…" },
  "Make a scrap": { en: "Make a scrap", ja: "スクラップを作る" },
  "Put in the scrap tray": { en: "Put in the scrap tray", ja: "スクラップトレイに入れました" },
  "Images stay in the images folder": { en: "Images stay in the images folder", ja: "画像は画像のフォルダの中だけ" },
  "No image": { en: "No image", ja: "画像がありません" },
  "Could not import {name}": { en: "Could not import {name}", ja: "{name} を取り込めませんでした" },
  "It is larger than 25MB": { en: "It is larger than 25MB", ja: "25MB を超えています" },
  "It is not an image that can be imported (PNG, JPEG, GIF, WebP, SVG)": {
    en: "It is not an image that can be imported (PNG, JPEG, GIF, WebP, SVG)",
    ja: "取り込める画像ではありません（PNG・JPEG・GIF・WebP・SVG）",
  },
  "The server could not take it": { en: "The server could not take it", ja: "常駐が受け取れませんでした" },
})
