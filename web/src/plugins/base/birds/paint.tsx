// 鳥の絵に色を塗って、普通の画像（blob の URL）にする所。(鳥, 配色) ごとに 1 回だけ塗り、結果を持ち続けて使い回す。
// 鳥は塗り終わるまで出さない（use-bird-sheet.tsx の useBirdSheet が null の間）。塗る計算は recolor.ts。canvas が使えない環境（テスト）では、陰影の絵をそのまま返す
import type { Bird } from "."
import type { BirdColors } from "./colors"
import buncho from "./images/sheets/buncho.png"
import bunchoMask from "./images/sheets/buncho-mask.png"
import fukurou from "./images/sheets/fukurou.png"
import fukurouMask from "./images/sheets/fukurou-mask.png"
import inko from "./images/sheets/inko.png"
import inkoMask from "./images/sheets/inko-mask.png"
import suzume from "./images/sheets/suzume.png"
import suzumeMask from "./images/sheets/suzume-mask.png"
import tsunagidori from "./images/sheets/tsunagidori.png"
import tsunagidoriMask from "./images/sheets/tsunagidori-mask.png"
import { recolor } from "./recolor"
import { SHEET_SIZE } from "./sheets"

const IMAGES: Record<Bird, { body: string; mask: string }> = {
  tsunagidori: { body: tsunagidori, mask: tsunagidoriMask },
  inko: { body: inko, mask: inkoMask },
  buncho: { body: buncho, mask: bunchoMask },
  suzume: { body: suzume, mask: suzumeMask },
  fukurou: { body: fukurou, mask: fukurouMask },
}

const made = new Map<string, Promise<string>>()
const ready = new Map<string, string>()

// 塗り終わったシートの URL（まだなら undefined）
export const paintedSheet = (key: string): string | undefined => ready.get(key)
export const sheetKey = (bird: Bird, c: BirdColors) => `${bird} ${c.feather} ${c.inner} ${c.flag}`.toLowerCase()

async function pixels(url: string, canvas: HTMLCanvasElement): Promise<Uint8ClampedArray | null> {
  const image = new Image()
  image.src = url
  await image.decode()
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.clearRect(0, 0, SHEET_SIZE, SHEET_SIZE)
  ctx.drawImage(image, 0, 0)
  return ctx.getImageData(0, 0, SHEET_SIZE, SHEET_SIZE).data
}

async function paint(bird: Bird, colors: BirdColors): Promise<string> {
  const { body: bodyUrl, mask: maskUrl } = IMAGES[bird]
  const canvas = document.createElement("canvas")
  canvas.width = SHEET_SIZE
  canvas.height = SHEET_SIZE
  const body = await pixels(bodyUrl, canvas)
  const mask = body ? await pixels(maskUrl, canvas) : null
  const ctx = canvas.getContext("2d")
  if (!body || !mask || !ctx) return bodyUrl
  ctx.putImageData(new ImageData(recolor(body, mask, colors), SHEET_SIZE, SHEET_SIZE), 0, 0)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"))
  return blob ? URL.createObjectURL(blob) : bodyUrl
}

// 鳥 bird に配色 colors を塗ったシートの URL
export function birdSheet(bird: Bird, colors: BirdColors): Promise<string> {
  const key = sheetKey(bird, colors)
  let url = made.get(key)
  if (!url) {
    url = paint(bird, colors)
    made.set(key, url)
    url.then(
      u => ready.set(key, u),
      () => made.delete(key),
    )
  }
  return url
}
