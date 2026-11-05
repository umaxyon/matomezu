// マークダウンの印刷の決まり: 描く画像だけのブロック・行の切れ目・紙の高さで切る（markdown/print.ts）
import { describe, expect, test } from "bun:test"
import { cutSheets, isImageBlock, lineBreaks } from "../../web/src/plugins/books/markdown/print"

describe("マークダウンの印刷の決まり（isImageBlock・lineBreaks）", () => {
  const image = (url = "data:image/png;base64,AA==") => ({
    kind: "image" as const,
    url,
    alt: "",
    range: { start: 0, end: 0 },
  })
  const text = (value: string) => ({ kind: "text" as const, value, range: { start: 0, end: 0 } })
  const paragraph = (children: unknown[]) => ({ kind: "paragraph", children, range: { start: 0, end: 0 } }) as never

  test("画像の決まりで切るのは、描く画像が 1 つだけで、ほかは空白と改行だけの段落", () => {
    expect(isImageBlock(paragraph([image()]))).toBe(true)
    expect(isImageBlock(paragraph([image(), text(" ")]))).toBe(true)
    expect(isImageBlock(paragraph([image(), image()]))).toBe(false) // 2 つ以上は行で分ける
    expect(isImageBlock(paragraph([image(), text("説明")]))).toBe(false)
    expect(isImageBlock(paragraph([image("https://example.com/a.png")]))).toBe(false) // 描かない画像
  })

  test("切ってよい所は、どの四角にもまたがれていない四角の下端（切り上げ）", () => {
    // 字の行 0〜20・20〜40 と、20〜60 にまたがる画像の箱: 40 は画像にまたがれるので切らない
    expect(
      lineBreaks(
        [
          { top: 0, bottom: 20.2 },
          { top: 20.2, bottom: 40 },
          { top: 25, bottom: 60 },
          { top: 60, bottom: 80 },
        ],
        80,
      ),
    ).toEqual([21, 60])
  })
})

describe("マークダウンを紙の高さで切る（cutSheets）", () => {
  const block = (
    top: number,
    bottom: number,
    kind: "heading" | "image" | "other" = "other",
    breaks: number[] = [],
    from = top,
  ) => ({ top, bottom, kind, breaks, from })
  const spans = (blocks: ReturnType<typeof block>[], height: number) =>
    cutSheets(blocks, height).cuts.map(c => [c.start, c.end])

  test("入る所まで並べ、入らないブロックから次の枠にする（次の枠はそのブロックの上端から）", () => {
    const cuts = spans([block(0, 40), block(50, 90), block(100, 140), block(150, 190)], 100)
    expect(cuts).toEqual([
      [0, 90],
      [100, 190],
    ])
  })

  test("見出しは枠の一番下に残さず、次のブロックと一緒に次の枠へ送る", () => {
    const cuts = spans([block(0, 40), block(50, 70, "heading"), block(80, 130)], 100)
    expect(cuts).toEqual([
      [0, 40],
      [50, 130],
    ])
    // 見出しが続くとき（h1 の次に h2）は、どちらも送る
    const chained = spans([block(0, 40), block(45, 60, "heading"), block(62, 75, "heading"), block(80, 130)], 100)
    expect(chained).toEqual([
      [0, 40],
      [45, 130],
    ])
    // 枠の頭の見出しの次が入らないときは、見出しは送らない（送ると空の枠ができる）
    const lead = spans([block(0, 20, "heading"), block(30, 200)], 100)
    expect(lead).toEqual([
      [0, 20],
      [30, 200],
    ])
  })

  test("行で分けられる物は、入る一番下の切ってよい所で切り、続きを次の枠の頭にする", () => {
    // 50〜250 の段落の行の下端が 70・90・…・250。枠 100 なら 1 枚目は 0〜90、2 枚目は 90〜190、3 枚目は 190〜250
    const lines = [70, 90, 110, 130, 150, 170, 190, 210, 230, 250]
    expect(spans([block(0, 40), block(50, 250, "other", lines)], 100)).toEqual([
      [0, 90],
      [90, 190],
      [190, 250],
    ])
  })

  test("入らない画像は、残りに半分以上入れば残りの高さまで縮め、入らなければ次の枠へ送る。枠より高い画像は枠の高さまで縮める。縮めても文書の最後まで切る", () => {
    // 50〜120 の画像は残り 50 に半分以上入るので 50 に縮め、後ろの 130〜170 は 20 上がって 110〜150 になり、次の枠へ
    expect(cutSheets([block(0, 40), block(50, 120, "image"), block(130, 170)], 100)).toEqual({
      cuts: [
        { start: 0, end: 100, from: 0 },
        { start: 110, end: 150, from: 130 },
      ],
      shrinks: [{ block: 1, height: 50 }],
    })
    expect(spans([block(0, 60), block(70, 160, "image")], 100)).toEqual([
      [0, 60],
      [70, 160],
    ])
    // 枠より高い画像は次の枠の頭で枠の高さに縮め、後ろのブロックは縮めた分だけ上げて続ける
    expect(cutSheets([block(0, 40), block(50, 300, "image"), block(310, 340)], 100)).toEqual({
      cuts: [
        { start: 0, end: 40, from: 0 },
        { start: 50, end: 150, from: 50 },
        { start: 160, end: 190, from: 310 },
      ],
      shrinks: [{ block: 1, height: 100 }],
    })
  })

  test("見出しの次が行で分けられる段落なら、見出しは送らず、段落の頭の行と同じ枠に残る", () => {
    expect(
      spans([block(0, 40), block(50, 70, "heading"), block(80, 200, "other", [100, 120, 140, 160, 180])], 100),
    ).toEqual([
      [0, 100],
      [100, 200],
    ])
  })

  test("枠より高いブロックは、枠 1 つに 1 つだけ置く。ブロックが無ければ切らない", () => {
    const cuts = spans([block(0, 40), block(50, 300), block(310, 340)], 100)
    expect(cuts).toEqual([
      [0, 40],
      [50, 300],
      [310, 340],
    ])
    expect(cutSheets([], 100)).toEqual({ cuts: [], shrinks: [] })
  })
})
