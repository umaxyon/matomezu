// 印刷プレビュー: フッタメニューのボタンで開くと、ブックの全ページの印刷区画を並べ、右サイドパネルに設定を出す。間はブックを変えるキー（元に戻す）が効かない。ロック中は変える前に聞く。
// 右サイドパネルを閉じる（Esc）か読み直すと編集に戻る。印刷区画をダブルクリックすると、そのページの編集に戻る。右端にスクロールバーを出す
import { expect, type Page, test } from "./fixtures"
import { newBook } from "./helpers/master"
import { panel } from "./helpers/note"
import { addBox, items, onPaper } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const preview = (page: Page) => page.locator("[data-print-preview]")
const sheets = (page: Page) => page.locator("[data-sheet]")

// ＋で開くダイアログで、ページを 1 つ足す
async function addPage(page: Page) {
  await page.getByRole("button", { name: "ページを足す" }).click()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("dialog", { name: "新しいページ" })).toBeHidden()
}

// 印刷プレビューを開き、右サイドパネルに中身が出るまで待つ
async function openPreview(page: Page) {
  await (await fromMenu(page, "印刷プレビュー")).click()
  await expect(panel(page)).toContainText("印刷プレビュー")
}

test("印刷プレビューを開くと、中身のあるページの印刷区画を並べ（何も載っていないページは並べない）、ページのタブを隠す。初めは幅に合わせ、元に戻すは効かず、Esc で閉じると編集に戻る", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, 150, "残る箱")
  await addPage(page)
  await expect(page.getByRole("tab")).toHaveCount(2)
  await openPreview(page)
  await expect(sheets(page)).toHaveCount(1)
  await expect(page.getByRole("tablist")).toHaveCount(0)
  // 初めは幅に合わせ（右サイドパネルの帯の「幅に合わせる」は押した状態）、1 枚目の紙の幅がステージの幅から余白を除いた幅になる
  await expect(panel(page).getByRole("button", { name: "幅に合わせる" })).toBeDisabled()
  const stage = (await page.locator("[data-stage]").boundingBox())!
  await expect(async () => {
    const first = (await sheets(page).first().boundingBox())!
    expect(Math.abs(first.width - (stage.width - 48))).toBeLessThan(stage.width * 0.01 + 1)
  }).toPass()
  await page.keyboard.press("Control+z")
  await page.keyboard.press("Escape")
  await expect(preview(page)).toHaveCount(0)
  await expect(page.getByRole("tab")).toHaveCount(2)
  await page.getByRole("tab").first().click()
  await expect(items(page)).toHaveText("残る箱")
})

test("並べる向きを横にすると、印刷区画が横に並ぶ。印刷区画のダブルクリックでそのページの編集に戻る。印刷プレビューは URL に入れず、読み直すと編集の画面", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, 150, "一")
  await addPage(page)
  await expect(page.getByRole("tab")).toHaveCount(2)
  await addBox(page, 200, 150, "二")
  await openPreview(page)
  const [a, b] = [sheets(page).nth(0), sheets(page).nth(1)]
  expect((await b.boundingBox())!.y).toBeGreaterThan((await a.boundingBox())!.y)
  await panel(page).getByTitle("横", { exact: true }).click()
  await expect(async () => {
    expect((await b.boundingBox())!.x).toBeGreaterThan((await a.boundingBox())!.x)
  }).toPass()
  await sheets(page).nth(0).dblclick()
  await expect(preview(page)).toHaveCount(0)
  await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true")
  await openPreview(page)
  await expect(page).not.toHaveURL(/m0=/)
  await page.reload()
  await expect(page.getByRole("tab")).toHaveCount(2)
  await expect(preview(page)).toHaveCount(0)
})

test("ロック中のブックで設定を変えると、書き換えてよいかを聞き、よければ変えてロックを掛け直す。やめれば変えない", async ({
  page,
}) => {
  await page.goto("/")
  await openPreview(page)
  const lock = panel(page).getByRole("button", { name: "ブックをロックする" })
  await lock.click()
  const unlock = panel(page).getByRole("button", { name: "ブックのロックを外す" })
  await expect(unlock).toHaveAttribute("aria-pressed", "true")
  const across = panel(page).getByRole("radio", { name: "横", exact: true })
  const ask = page.getByRole("alertdialog", { name: "ロック中ですが書き換えてもいいですか？" })
  await panel(page).getByTitle("横", { exact: true }).click()
  await ask.getByRole("button", { name: "キャンセル" }).click()
  await expect(ask).toBeHidden()
  await expect(across).not.toBeChecked()
  await panel(page).getByTitle("横", { exact: true }).click()
  await ask.getByRole("button", { name: "確定" }).click()
  await expect(across).toBeChecked()
  await expect(unlock).toHaveAttribute("aria-pressed", "true")
})

test("可変ページの何も載っていない印刷区画は、書く画面で薄く暗くし、印刷プレビューには並べない", async ({ page }) => {
  await page.goto("/")
  await addBox(page, 200, 200, "一")
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByRole("switch", { name: "可変ページにする" }).click()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  // 中身の印刷区画と、右・下の空きで 2×2。箱のある印刷区画のほかの 3 つが暗い
  await expect(page.locator("[data-print-areas]")).toHaveAttribute("data-print-areas", "2x2")
  await expect(page.locator("[data-unprinted]")).toHaveCount(3)
  await openPreview(page)
  await expect(sheets(page)).toHaveCount(1)
})

test("印刷プレビューの紙に、ページの形と線を描く（見るだけで、形に編集の印は付けない）", async ({ page }) => {
  await page.goto("/")
  await addBox(page, 200, 200, "左")
  await addBox(page, 600, 200, "右")
  // 左の箱の右の〇から、右の箱へ線を引く
  const empty = await onPaper(page, 600, 500)
  await page.mouse.click(empty.x, empty.y)
  const start = items(page).filter({ hasText: "左" })
  const s = (await start.boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  const r = (await start.locator('[data-port="r"]').boundingBox())!
  const e = (await items(page).filter({ hasText: "右" }).boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  await page.mouse.move(e.x + 10, e.y + e.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator("[data-item]:not([data-shape])")).toHaveCount(1)
  await openPreview(page)
  const sheet = sheets(page).first()
  await expect(sheet).toContainText("左")
  await expect(sheet).toContainText("右")
  await expect(sheet.locator("polyline")).not.toHaveCount(0)
  // 紙の中の形には、e2e や操作が探す印（data-shape）を付けない
  await expect(sheet.locator("[data-shape]")).toHaveCount(0)
})

test("ツリーとディレクトリ構成図も、印刷プレビューの紙に中身を描く", async ({ page }) => {
  await page.goto("/")
  const tree = await newBook(page, "木", "ツリー")
  await tree.getByLabel("根のキャプション").fill("根っこ")
  await tree.getByRole("button", { name: "作る" }).click()
  await expect(tree).toBeHidden()
  await openPreview(page)
  await expect(sheets(page).first()).toContainText("根っこ")
  await page.keyboard.press("Escape")
  await expect(preview(page)).toHaveCount(0)
  const dir = await newBook(page, "構成", "ディレクトリ構成図")
  await dir.getByLabel("根のフォルダの名前").fill("proj")
  await dir.getByRole("button", { name: "作る" }).click()
  await expect(dir).toBeHidden()
  await openPreview(page)
  await expect(sheets(page).first()).toContainText("proj")
})

test("印刷できるものが何も無いブックでは、紙を並べず、印刷できるものが無いと知らせる", async ({ page }) => {
  await page.goto("/")
  await openPreview(page)
  await expect(sheets(page)).toHaveCount(0)
  await expect(page.getByText("印刷できるものはありません")).toBeVisible()
})

test("可変ページで印刷区画の境目をまたいだ箱があると、印刷プレビューを開かず、直してほしいと知らせてその箱のバッジを並べる", async ({
  page,
}) => {
  await page.goto("/")
  const empty = await onPaper(page, 600, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByRole("switch", { name: "可変ページにする" }).click()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  // 1 つ目の印刷区画の右の端（A4 横は幅 1123）をまたぐ箱
  await addBox(page, 1090, 200, "跨ぐ")
  await openPreview(page)
  await expect(panel(page)).toContainText("印刷区画をまたいだボックスを直してください")
  await expect(panel(page).getByRole("button", { name: "跨ぐ" })).toBeVisible()
  await expect(preview(page)).toHaveCount(0)
  await expect(page.getByRole("tab")).toHaveCount(1) // 印刷プレビューにならず、編集のまま
})

test("マークダウンは、紙の高さでブロックの境目ごとに切って印刷区画に並べる（原文が空なら並べない）", async ({
  page,
}) => {
  await page.goto("/")
  const add = await newBook(page, "メモ", "マークダウン")
  await add.getByRole("button", { name: "作成" }).click()
  await expect(add).toBeHidden()
  await openPreview(page)
  await expect(page.getByText("印刷できるものはありません")).toBeVisible()
  await page.keyboard.press("Escape")
  const field = page.getByRole("region", { name: "ソース" }).getByRole("textbox")
  await field.click()
  // 段落 60 個（A4 縦の 1 枚には入らない）
  await page.keyboard.insertText(Array.from({ length: 60 }, (_, i) => `段落 ${i + 1}`).join("\n\n"))
  await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("段落 60")
  await openPreview(page)
  await expect(async () => expect(await sheets(page).count()).toBeGreaterThan(1)).toPass()
  // 1 枚目は原文の頭から、最後の紙は途中のブロックから始まり、「段落 60」は最後の紙の中に見える（1 枚目の外）
  await expect(sheets(page).first().locator("[data-markdown-from]")).toHaveAttribute("data-markdown-from", "0")
  const lastFrom = Number(await sheets(page).last().locator("[data-markdown-from]").getAttribute("data-markdown-from"))
  expect(lastFrom).toBeGreaterThan(0)
  // 各紙は自分に掛かるブロックだけを描く: 最後の紙に「段落 60」があり、1 枚目には無い
  await expect(sheets(page).last().getByText("段落 60", { exact: true })).toBeVisible()
  await expect(sheets(page).first().getByText("段落 60", { exact: true })).toHaveCount(0)
})

test("マークダウンの長い段落は、紙の高さに入る所で行の途中から次の紙に続ける", async ({ page }) => {
  await page.goto("/")
  const add = await newBook(page, "長文", "マークダウン")
  await add.getByRole("button", { name: "作成" }).click()
  await expect(add).toBeHidden()
  const field = page.getByRole("region", { name: "ソース" }).getByRole("textbox")
  await field.click()
  // 1 つの段落（改行を「  」で終える行を重ねて、A4 縦の 1 枚に入らない高さにする）
  await page.keyboard.insertText(Array.from({ length: 80 }, (_, i) => `行 ${i + 1}  `).join("\n"))
  await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("行 80")
  await openPreview(page)
  await expect(async () => expect(await sheets(page).count()).toBeGreaterThan(1)).toPass()
  // どの紙も同じ段落（原文の頭のブロック）の続きで、最後の行は最後の紙に見える
  await expect(sheets(page).last().locator("[data-markdown-from]")).toHaveAttribute("data-markdown-from", "0")
  // どの「行 N」も、字の四角がまるごと入る紙がちょうど 1 枚ある（切れ目の行が切れていない・2 枚に重ねて出ていない）
  const counts = await page.evaluate(() => {
    // 見えるのは、紙ごとに切った所の枠（data-markdown-from）の中だけ（枠の外の字は、紙の余白の所でも隠れている）
    const sheets = [...document.querySelectorAll("[data-print-preview] [data-markdown-from]")].map(s =>
      s.getBoundingClientRect(),
    )
    const seen = new Map<string, number>()
    for (const el of document.querySelectorAll("[data-print-preview] [data-markdown-from]")) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        for (const m of (n.textContent ?? "").matchAll(/行 \d+/g)) {
          const range = document.createRange()
          range.setStart(n, m.index ?? 0)
          range.setEnd(n, (m.index ?? 0) + m[0].length)
          const r = range.getBoundingClientRect()
          const whole = sheets.some(b => r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5 && r.height > 0)
          const box = el.getBoundingClientRect()
          if (whole && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5) seen.set(m[0], (seen.get(m[0]) ?? 0) + 1)
        }
      }
    }
    return Object.fromEntries(seen)
  })
  expect([...Array.from({ length: 80 }, (_, i) => counts[`行 ${i + 1}`])]).toEqual(Array(80).fill(1))
})

// 幅 300・高さ h の画像（data: の URL。描く画像）
const tallImage = (h: number) =>
  `![画像](data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="${h}"><rect width="300" height="${h}" fill="#888"/></svg>`).toString("base64")})`

test("マークダウンの画像は、紙の残りに半分以上入れば縮めて今の紙に入れ、紙より高い画像は紙の高さに縮める", async ({
  page,
}) => {
  await page.goto("/")
  const add = await newBook(page, "画像", "マークダウン")
  await add.getByRole("button", { name: "作成" }).click()
  await expect(add).toBeHidden()
  const field = page.getByRole("region", { name: "ソース" }).getByRole("textbox")
  await field.click()
  const lines = Array.from({ length: 20 }, (_, i) => `前 ${i + 1}  `).join("\n")
  await page.keyboard.insertText(`${lines}\n\n${tallImage(800)}\n\n後ろ\n\n${tallImage(3000)}`)
  await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("後ろ")
  await openPreview(page)
  await expect(async () => expect(await sheets(page).count()).toBe(2)).toPass()
  const box = async (i: number) => (await sheets(page).nth(i).boundingBox())!
  const within = (r: { y: number; height: number }, b: { y: number; height: number }) =>
    r.y >= b.y - 0.5 && r.y + r.height <= b.y + b.height + 0.5
  // 1 枚目に縮めた画像。2 枚目の頭に「後ろ」と、紙の高さより小さく縮めた画像（紙の高さに縮めたあと、残りに半分以上入るので残りの高さへ）
  const first = (await sheets(page).nth(0).locator("img").boundingBox())!
  expect(within(first, await box(0))).toBe(true)
  const after = (await sheets(page).nth(1).getByText("後ろ", { exact: true }).boundingBox())!
  expect(within(after, await box(1))).toBe(true)
  const big = (await sheets(page).nth(1).locator("img").boundingBox())!
  expect(within(big, await box(1))).toBe(true)
})

test("印刷プレビューの右端のスクロールバーは、つまみのドラッグと溝を押すので紙をずらし、ホイールでずらすとつまみが付いて動く", async ({
  page,
}) => {
  await page.goto("/")
  const add = await newBook(page, "長いメモ", "マークダウン")
  await add.getByRole("button", { name: "作成" }).click()
  await expect(add).toBeHidden()
  const field = page.getByRole("region", { name: "ソース" }).getByRole("textbox")
  await field.click()
  await page.keyboard.insertText(Array.from({ length: 120 }, (_, i) => `段落 ${i + 1}`).join("\n\n"))
  await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("段落 120")
  await openPreview(page)
  await expect(async () => expect(await sheets(page).count()).toBeGreaterThan(2)).toPass()
  // 右サイドパネルが滑り込み、幅に合わせ終わるまで待つ
  await expect(panel(page).getByRole("button", { name: "幅に合わせる" })).toBeDisabled()
  const bar = page.locator('[data-preview-scrollbar="y"]')
  const thumb = bar.locator("div")
  await expect(bar).toBeVisible()
  const top = async () => (await sheets(page).first().boundingBox())?.y ?? 0
  const thumbTop = async () => (await thumb.boundingBox())?.y ?? 0
  // つまみを下へドラッグすると、紙が上へずれる
  const before = await top()
  const t = await thumb.boundingBox()
  if (!t) throw new Error("つまみが無い")
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2)
  await page.mouse.down()
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2 + 60, { steps: 4 })
  await page.mouse.up()
  await expect(async () => expect(await top()).toBeLessThan(before - 60)).toPass()
  // 溝のいちばん下を押すと、いちばん下まで移る（つまみが溝の下端に付く）
  const b = await bar.boundingBox()
  if (!b) throw new Error("溝が無い")
  await page.mouse.click(b.x + b.width / 2, b.y + b.height - 2)
  await expect(async () => {
    const now = await thumb.boundingBox()
    expect((now?.y ?? 0) + (now?.height ?? 0)).toBeGreaterThan(b.y + b.height - 1.5)
  }).toPass()
  // ホイールで上へずらすと、つまみも上へ動く
  const low = await thumbTop()
  await page.mouse.move(b.x - 200, b.y + b.height / 2)
  await page.mouse.wheel(0, -400)
  await expect(async () => expect(await thumbTop()).toBeLessThan(low)).toPass()
  // 幅に合わせて並べたので、印刷区画は横にはみ出さず、横のバーは出さない
  await expect(page.locator('[data-preview-scrollbar="x"]')).toHaveCount(0)
})

test("印刷のボタンと Ctrl+P は、並べた印刷区画を 1 つずつ紙 1 枚に刷る（刷るときは画面を隠す）。編集の画面の Ctrl+P は印刷プレビューを開く。ページ番号とブック名は設定で入れる", async ({
  page,
}) => {
  // ブラウザの印刷ダイアログは開かず、頼まれた回数を数える
  await page.addInitScript(() => {
    const w = window as unknown as { printed: number; print: () => void }
    w.printed = 0
    w.print = () => {
      w.printed++
    }
  })
  const printed = () => page.evaluate(() => (window as unknown as { printed: number }).printed)
  await page.goto("/")
  await addBox(page, 200, 150, "刷る箱")
  await addPage(page)
  await page.getByRole("tab").last().click()
  await addBox(page, 300, 200, "2 枚目の箱")
  // 編集の画面で Ctrl+P を押すと、刷らずに印刷プレビューを開く
  await page.locator("[data-stage]").click({ position: { x: 5, y: 5 } })
  await page.keyboard.press("ControlOrMeta+p")
  await expect(panel(page)).toContainText("印刷プレビュー")
  await expect(sheets(page)).toHaveCount(2)
  expect(await printed()).toBe(0)
  // 印刷のボタンと、印刷プレビューの間の Ctrl+P で刷る
  await panel(page).getByRole("button", { name: "印刷", exact: true }).click()
  await page.keyboard.press("ControlOrMeta+p")
  await expect(async () => expect(await printed()).toBe(2)).toPass()
  // 刷る物は印刷区画 1 つが紙 1 枚（紙の大きさの名前付きの @page。既定の紙は A4 横）。刷るときは画面を隠し、刷る物だけを出す
  const output = page.locator("[data-print-output]")
  await expect(output).toHaveAttribute("data-print-output", "2")
  await expect(output.locator("[data-print-page]").first()).toHaveAttribute("data-print-page", "sheet-1123x794")
  await expect(output).toBeHidden()
  await page.emulateMedia({ media: "print" })
  await expect(page.locator("#root")).toBeHidden()
  await expect(output).toBeVisible()
  await expect(output.getByText("刷る箱")).toBeVisible()
  // body の直下にほかの物（画面の部品が置く物など）があっても、刷るときは隠し、空の紙を足さない
  await page.evaluate(() => {
    const extra = document.createElement("div")
    extra.textContent = "画面の部品"
    document.body.prepend(extra)
  })
  // PDF にすると、印刷区画 1 つが紙 1 枚で、紙は A4 横（1123×794 px を pt にした 842×596）
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1")
  expect(pdf.match(/\/Type\s*\/Page\b/g)?.length).toBe(2)
  const boxes = [...pdf.matchAll(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/g)].map(m =>
    [m[1], m[2]].map(n => Math.round(Number(n))),
  )
  expect(boxes).toEqual([
    [842, 596],
    [842, 596],
  ])
  await page.emulateMedia({ media: "screen" })
  // ページ番号とブック名を入れると、印刷プレビューにも刷る物にも出る（番号は通し）
  await expect(page.locator("[data-sheet-number]")).toHaveCount(0)
  await panel(page).getByRole("switch", { name: "ページ番号を入れる" }).click()
  await expect(sheets(page).last().locator("[data-sheet-number]")).toHaveText("2 / 2")
  await expect(output.locator("[data-sheet-number]").last()).toHaveText("2 / 2")
})
