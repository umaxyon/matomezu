// 鳥の素材（色を変えられるマスク付きのスプライト）を、画面に配る大きさに縮めて書き出す。
// 使い方: bun scripts/birds.ts <素材のフォルダ>（sprites/ と marks/ がある所）
// 歩く鳥（sprites/）: 素材は鳥ごとに 4 枚（陰影の neutral と、外羽・内羽・旗のマスク）で、1 コマ 448 四角が 4x4。
// これを 1/3 に縮め（コマ 150 四角、シート 600 四角）、次の 2 枚にして web/src/plugins/base/birds/images/sheets/ に置く。
//   {id}.png      陰影と固定色（RGBA。縮めるときは透明度で重みを付けて混ぜる）
//   {id}-mask.png 外羽・内羽・旗の割合（R・G・B。0〜255 が 0〜1。3 つは重ならず、足して 1 以下）
// 足元を縮小後の整数の位置に置くため、元の絵を右と下に 1px ずらして 450 四角にしてから縮める（anchorX は 75、groundY は 127）
// 丸い顔（marks/）: 48px の絵を、images/faces/ に次の 2 枚にして置く（鳥の顔の丸い絵。ポインタと送信トレイの行）
//   {id}.png      固定色の部分（RGBA）
//   {id}-mask.png 外羽・内羽・旗の部分の透明度（R・G・B）。固定色と 3 つを足して 255 以下

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { deflateSync, inflateSync } from "node:zlib"

const SOURCE_CELL = 448
const PADDED = 450
const FACTOR = 3
const CELL = PADDED / FACTOR
const COLUMNS = 4
const SIZE = CELL * COLUMNS

interface Raster {
  w: number
  h: number
  data: Uint8Array // RGBA
}

function decode(path: string): Raster {
  const b = readFileSync(path)
  let o = 8
  let w = 0
  let h = 0
  const idat: Buffer[] = []
  while (o < b.length) {
    const len = b.readUInt32BE(o)
    const type = b.toString("ascii", o + 4, o + 8)
    if (type === "IHDR") {
      w = b.readUInt32BE(o + 8)
      h = b.readUInt32BE(o + 12)
      if (b[o + 16] !== 8 || b[o + 17] !== 6 || b[o + 20] !== 0)
        throw new Error(`${path}: 8 ビット RGBA の飛ばし読みなしだけ読めます`)
    }
    if (type === "IDAT") idat.push(b.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * 4
  const out = new Uint8Array(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)] as number
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x] as number
      const a = x >= 4 ? (out[y * stride + x - 4] as number) : 0
      const u = y > 0 ? (out[(y - 1) * stride + x] as number) : 0
      const c = x >= 4 && y > 0 ? (out[(y - 1) * stride + x - 4] as number) : 0
      let r: number
      if (f === 0) r = v
      else if (f === 1) r = v + a
      else if (f === 2) r = v + u
      else if (f === 3) r = v + ((a + u) >> 1)
      else {
        const p = a + u - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - u)
        const pc = Math.abs(p - c)
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? u : c)
      }
      out[y * stride + x] = r & 255
    }
  }
  return { w, h, data: out }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const x of buf) c = (crcTable[(c ^ x) & 255] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, "ascii")
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, tail])
}

// 色の種類 channels（3 = RGB、4 = RGBA）の画素を、各行を Sub フィルターで PNG にする
function encode(w: number, h: number, channels: 3 | 4, pixels: Uint8Array): Buffer {
  const stride = w * channels
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 1
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? (pixels[y * stride + x - channels] as number) : 0
      raw[y * (stride + 1) + 1 + x] = ((pixels[y * stride + x] as number) - left) & 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = channels === 4 ? 6 : 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

interface SheetInfo {
  id: string
  image: string
  featherMask: string
  innerMask: string
  flagMask: string
  frames: { index: number; bounds: { w: number } }[]
}

if (!process.argv[2]) throw new Error("使い方: bun scripts/birds.ts <素材のフォルダ>")
const showcase = resolve(process.argv[2])
const root = join(showcase, "sprites")
const sprites = JSON.parse(readFileSync(join(root, "sprites.json"), "utf8")) as { sheets: SheetInfo[] }
const outDir = resolve(import.meta.dir, "../web/src/plugins/base/birds/images/sheets")
mkdirSync(outDir, { recursive: true })

for (const sheet of sprites.sheets) {
  const neutral = decode(join(root, sheet.image))
  const masks = [sheet.featherMask, sheet.innerMask, sheet.flagMask].map(p => decode(join(root, p)))
  const body = new Uint8Array(SIZE * SIZE * 4)
  const weight = new Uint8Array(SIZE * SIZE * 3)
  for (let frame = 0; frame < COLUMNS * COLUMNS; frame++) {
    const originX = (frame % COLUMNS) * SOURCE_CELL
    const originY = Math.floor(frame / COLUMNS) * SOURCE_CELL
    for (let dy = 0; dy < CELL; dy++) {
      for (let dx = 0; dx < CELL; dx++) {
        let alpha = 0
        const sum = [0, 0, 0]
        const region = [0, 0, 0]
        for (let sy = 0; sy < FACTOR; sy++) {
          for (let sx = 0; sx < FACTOR; sx++) {
            const px = dx * FACTOR + sx - 1
            const py = dy * FACTOR + sy - 1
            if (px < 0 || py < 0 || px >= SOURCE_CELL || py >= SOURCE_CELL) continue
            const i = ((originY + py) * neutral.w + originX + px) * 4
            const a = neutral.data[i + 3] as number
            alpha += a
            for (let c = 0; c < 3; c++) sum[c] = (sum[c] as number) + (neutral.data[i + c] as number) * a
            for (let m = 0; m < 3; m++) region[m] = (region[m] as number) + ((masks[m] as Raster).data[i + 3] as number)
          }
        }
        const o = ((Math.floor(frame / COLUMNS) * CELL + dy) * SIZE + (frame % COLUMNS) * CELL + dx) * 4
        if (alpha === 0) continue
        for (let c = 0; c < 3; c++) body[o + c] = Math.round((sum[c] as number) / alpha)
        body[o + 3] = Math.round(alpha / (FACTOR * FACTOR))
        const w = o - (o >> 2)
        for (let m = 0; m < 3; m++) weight[w + m] = Math.min(255, Math.round(((region[m] as number) / alpha) * 255))
      }
    }
  }
  writeFileSync(join(outDir, `${sheet.id}.png`), encode(SIZE, SIZE, 4, body))
  writeFileSync(join(outDir, `${sheet.id}-mask.png`), encode(SIZE, SIZE, 3, weight))
  const walk = sheet.frames.filter(f => f.index >= 8 && f.index <= 11).map(f => f.bounds.w / FACTOR)
  console.log(sheet.id, "歩くコマの鳥の幅（旗まで）", Math.max(...walk).toFixed(2))
}

const FACE = 48
const facesDir = resolve(import.meta.dir, "../web/src/plugins/base/birds/images/faces")
mkdirSync(facesDir, { recursive: true })
for (const { id } of sprites.sheets) {
  const layer = (name: string) => decode(join(showcase, "marks/img", String(FACE), `${id}-${name}.png`))
  const fixed = layer("fixed")
  const parts = ["feather", "inner", "flag"].map(layer)
  const weight = new Uint8Array(FACE * FACE * 3)
  for (let p = 0; p < FACE * FACE; p++)
    for (let m = 0; m < 3; m++) weight[p * 3 + m] = (parts[m] as Raster).data[p * 4 + 3] as number
  writeFileSync(join(facesDir, `${id}.png`), encode(FACE, FACE, 4, fixed.data))
  writeFileSync(join(facesDir, `${id}-mask.png`), encode(FACE, FACE, 3, weight))
  console.log(id, "丸い顔", FACE)
}
