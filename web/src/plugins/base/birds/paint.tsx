// 鳥の絵に色を塗って、普通の画像（blob の URL）にする所。(鳥, 配色) ごとに 1 回だけ塗り、結果を持ち続けて使い回す。
// 鳥は塗り終わるまで出さない（use-bird-sheet.tsx の useBirdSheet が null の間）。塗る計算は recolor.ts。canvas が使えない環境（テスト）では、陰影の絵をそのまま返す
import type { Bird } from "."
import type { BirdColors } from "./colors"
import bunchoFace from "./images/faces/buncho.png"
import bunchoFaceMask from "./images/faces/buncho-mask.png"
import fukurouFace from "./images/faces/fukurou.png"
import fukurouFaceMask from "./images/faces/fukurou-mask.png"
import inkoFace from "./images/faces/inko.png"
import inkoFaceMask from "./images/faces/inko-mask.png"
import suzumeFace from "./images/faces/suzume.png"
import suzumeFaceMask from "./images/faces/suzume-mask.png"
import tsunagidoriFace from "./images/faces/tsunagidori.png"
import tsunagidoriFaceMask from "./images/faces/tsunagidori-mask.png"
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
import { recolor, recolorFace } from "./recolor"
import { FACE_SIZE, SHEET_SIZE } from "./sheets"

const IMAGES: Record<Bird, { body: string; mask: string }> = {
  tsunagidori: { body: tsunagidori, mask: tsunagidoriMask },
  inko: { body: inko, mask: inkoMask },
  buncho: { body: buncho, mask: bunchoMask },
  suzume: { body: suzume, mask: suzumeMask },
  fukurou: { body: fukurou, mask: fukurouMask },
}

const FACES: Record<Bird, { body: string; mask: string }> = {
  tsunagidori: { body: tsunagidoriFace, mask: tsunagidoriFaceMask },
  inko: { body: inkoFace, mask: inkoFaceMask },
  buncho: { body: bunchoFace, mask: bunchoFaceMask },
  suzume: { body: suzumeFace, mask: suzumeFaceMask },
  fukurou: { body: fukurouFace, mask: fukurouFaceMask },
}

const made = new Map<string, Promise<string>>()
const ready = new Map<string, string>()

// 塗り終わったシートの URL（まだなら undefined）
export const paintedSheet = (key: string): string | undefined => ready.get(key)
export const sheetKey = (bird: Bird, c: BirdColors) => `${bird} ${c.feather} ${c.inner} ${c.flag}`.toLowerCase()

async function pixels(url: string, canvas: HTMLCanvasElement, size = SHEET_SIZE): Promise<Uint8ClampedArray | null> {
  const image = new Image()
  image.src = url
  await image.decode()
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(image, 0, 0)
  return ctx.getImageData(0, 0, size, size).data
}

// 絵 images（陰影か固定色の絵と、マスクの絵。一辺 size）に、色を塗る計算 mix をかけて、画像（blob の URL）にする。canvas が使えなければ、元の絵の URL
async function paint(
  images: { body: string; mask: string },
  size: number,
  mix: (body: Uint8ClampedArray, mask: Uint8ClampedArray) => Uint8ClampedArray<ArrayBuffer>,
): Promise<string> {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const body = await pixels(images.body, canvas, size)
  const mask = body ? await pixels(images.mask, canvas, size) : null
  const ctx = canvas.getContext("2d")
  if (!body || !mask || !ctx) return images.body
  ctx.putImageData(new ImageData(mix(body, mask), size, size), 0, 0)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"))
  return blob ? URL.createObjectURL(blob) : images.body
}

// 鳥 bird に配色 colors を塗ったシートの URL
export function birdSheet(bird: Bird, colors: BirdColors): Promise<string> {
  const key = sheetKey(bird, colors)
  let url = made.get(key)
  if (!url) {
    url = paint(IMAGES[bird], SHEET_SIZE, (body, mask) => recolor(body, mask, colors))
    made.set(key, url)
    url.then(
      u => ready.set(key, u),
      () => made.delete(key),
    )
  }
  return url
}

// 鳥 bird の顔の丸い絵に配色 colors を塗った絵の URL
export function birdFace(bird: Bird, colors: BirdColors): Promise<string> {
  const key = `face ${sheetKey(bird, colors)}`
  let url = made.get(key)
  if (!url) {
    url = paint(FACES[bird], FACE_SIZE, (body, mask) => recolorFace(body, mask, colors))
    made.set(key, url)
    url.then(
      u => ready.set(key, u),
      () => made.delete(key),
    )
  }
  return url
}
