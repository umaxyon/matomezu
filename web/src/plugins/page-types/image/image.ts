// 画像のページのタイプ: ページ 1 枚が画像 1 枚で、ページのフィールド asset に、アセット（画像のバイト列。常駐がブックのデータとは別に、中身の sha256 を id にして持つ）の id を、
// width・height にその画像の幅と高さ（px。取り込んだときに常駐が答えた値）を持つ。どれも作るときに決まり、あとから替えない（直すときのフィールドは受けない）。紙に置けるアイテムは無い。紙は A4 で、向きは作るときに画像の縦横から決める。
// 画像は紙の余白の内側に収めて真ん中に描き、小さな画像は大きくしない。アセットが無ければ「画像がありません」と描く（アセットが無いのは、あってよい形）。
// 画像のページは画像のフォルダ（システムフォルダ）とその下にだけ置ける（in-images）。作るのは base の page-create で、作るダイアログは、ファイルを選ぶ窓を開いて取り込む物
import { z } from "zod"
import { type CoreCatalog, foldersOver, type ItemPage, type NewPageDialogArgs } from "../../../plugin-api"
import {
  DIAGRAM_THEME_TYPE,
  NO_EXTENT,
  NO_GROW,
  PAGE_PAPER_COLOR,
  PAPER_IDS,
  type PrintSheets,
  pageFieldsWay,
  paperSize,
  printSheetsOf,
} from "../../base"
import { kit } from "./kit"

// アセットの id の形（中身の sha256 の 16 進）
export const ASSET_ID = z.string().regex(/^[0-9a-f]{64}$/)
// 画像の幅・高さの形（px）
const IMAGE_PX = z.number().int().positive()

// 画像を収める、紙の端からの余白（紙の上の px）
export const IMAGE_MARGIN = 38

// 画像のページの印刷区画: 紙は 1 枚で（増えない）、いつも載っている（中身は画像 1 枚で、紙いっぱいを使う）
export function imagePrintSheets(catalog: CoreCatalog, page: ItemPage): PrintSheets {
  const paper = paperSize(catalog, page)
  return printSheetsOf(paper, [{ x: 0, y: 0, w: paper.w, h: paper.h }], NO_GROW, NO_EXTENT)
}

// 画像のプレゼンテーション: 紙の上に画像 1 枚を描く。印刷は、画像を読み終えるまで刷らない（ビューが usePrintHold で待たせる）
export const IMAGE_PRESENTATION = kit.definePresentation({
  id: "image",
  printSheets: imagePrintSheets,
})

// 画像を取り込むダイアログ（受けたフォルダに、選んだファイルを 1 枚 1 ページで取り込む。base の新しいページの値を受ける）
export const IMPORT_IMAGES_DIALOG = kit.defineDialogWith<NewPageDialogArgs>()({
  id: "import-images",
})

// ページの asset（無いか形が違えば空）
export const assetOf = (page: object): string => ("asset" in page && typeof page.asset === "string" ? page.asset : "")

// ページの画像の幅と高さ（px。形が違えば NO_IMAGE_SIZE）
export const NO_IMAGE_SIZE = { w: 0, h: 0 } as const
export function imageSizeOf(page: object): { w: number; h: number } {
  const w = "width" in page && typeof page.width === "number" ? page.width : 0
  const h = "height" in page && typeof page.height === "number" ? page.height : 0
  return w > 0 && h > 0 ? { w, h } : NO_IMAGE_SIZE
}

export const IMAGE = kit.definePageType({
  id: "image",
  version: 1,
  title: "Image",
  duplicatesPages: true, // 中の物は無く、写しも同じアセットを指す
  grouping: "none",
  paper: { allowed: PAPER_IDS, default: "@matomezu/base:a4", orientation: "portrait" },
  fields: {
    asset: ASSET_ID.describe("The id of the asset (the image's bytes) the page shows; see import_image"),
    width: IMAGE_PX.describe("The image's width in pixels, as import_image answered"),
    height: IMAGE_PX.describe("The image's height in pixels, as import_image answered"),
  },
  // 作るときは asset・width・height を必ず受け、直すときは何も受けない（アセットは替えない）
  pageFieldsInput: {
    add: pageFieldsWay({
      args: z.strictObject({ asset: ASSET_ID, width: IMAGE_PX, height: IMAGE_PX }),
      write: (_page, input) => ({ fields: input }),
    }),
    update: pageFieldsWay({ args: z.strictObject({}), write: () => null }),
  },
  dialogs: { add: IMPORT_IMAGES_DIALOG.id },
  items: { allowed: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: [DIAGRAM_THEME_TYPE], // 紙の色だけを使う
  presentation: IMAGE_PRESENTATION.id,
  tokens: [],
  settings: [PAGE_PAPER_COLOR.id],
  assetsOf: page => {
    const asset = assetOf(page)
    return asset === "" ? [] : [asset]
  },
})

// 画像のフォルダ: 書庫ホームのシステムフォルダ。画像のページは、この中とその下のフォルダにだけ置ける
export const IMAGES = kit.defineSystemFolder({
  id: "images",
  title: "Images",
  aiDescription:
    "The images folder: image pages are only in it and in its folders, and nothing else goes in. Import an image with import_image, then make its page here with page-create (type @matomezu/image:image, fields {asset, width, height} as import_image answers them).",
})

type Folders = Parameters<typeof foldersOver>[0]
type Folder = Folders[string]

// フォルダ f が画像のフォルダか
export const isImagesFolder = (f: Folder | object): boolean =>
  "folderRole" in f && f.folderRole === "folder" && "systemFolder" in f && f.systemFolder === IMAGES.id

// 書庫のフォルダの列 over（近い順）の、どれかが画像のフォルダか（none は書庫のフォルダの中でない）
export const underImages = (over: readonly object[] | "none"): boolean => over !== "none" && over.some(isImagesFolder)

// 書庫 folders のフォルダ id が、画像のフォルダかその下のフォルダか
export const inImages = (folders: Folders, id: string): boolean => {
  const f = folders[id]
  return f !== undefined && f.folderRole === "folder" && (isImagesFolder(f) || underImages(foldersOver(folders, id)))
}
