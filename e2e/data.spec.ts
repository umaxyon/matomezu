import { expect, type Page, test } from "@playwright/test"
import { drawerTool } from "./drawer"

// データを紙の (120, 120) に置き、置いたデータを返す
async function addData(page: Page) {
  await (await drawerTool(page, "データ")).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 120, paper.y + 120)
  const placed = page.locator("[data-item]").filter({ has: page.locator("[data-empty]") })
  await expect(placed).toHaveCount(1)
  return page.locator(`[data-item="${await placed.getAttribute("data-item")}"]`)
}

test("データを置くと点線の枠に No Data と出る。編集のダイアログで列と行を足して確定すると表になり、表が全部見える大きさに広がる", async ({
  page,
}) => {
  await page.goto("/")
  const data = await addData(page)
  await expect(data).toHaveText("No Data")
  const before = (await data.boundingBox())!
  await data.dblclick()
  const dialog = page.getByRole("dialog", { name: "データの編集" })
  // 列が無い間は行を足せない
  await expect(dialog.getByRole("button", { name: "＋ 行を足す" })).toHaveCount(0)
  await dialog.getByRole("button", { name: "＋ 列を足す" }).click()
  await dialog.getByRole("button", { name: "＋ 列を足す" }).click()
  const names = dialog.getByLabel("列の名前")
  await names.nth(0).fill("月")
  await dialog.getByLabel("列の型").nth(0).selectOption("text")
  await names.nth(1).fill("売上")
  await dialog.getByRole("button", { name: "＋ 行を足す" }).click()
  await dialog.getByRole("button", { name: "＋ 行を足す" }).click()
  const cells = dialog.locator("tbody input")
  await cells.nth(0).fill("1月")
  await cells.nth(1).fill("12")
  await cells.nth(2).fill("2月")
  // 数の列に数でない文字を書くと、そのセルが赤くなり確定を押せない
  await cells.nth(3).fill("たくさん")
  await expect(cells.nth(3)).toHaveAttribute("aria-invalid", "true")
  await expect(dialog.getByRole("button", { name: "確定" })).toBeDisabled()
  // 数として読めないセルがあるので、月の列は数にできない
  await dialog.getByLabel("列の型").nth(0).selectOption("number")
  await expect(dialog.getByRole("alert")).toHaveText("数でないセルがあります")
  await expect(dialog.getByLabel("列の型").nth(0)).toHaveValue("text")
  await cells.nth(3).fill("30")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(data.locator("th")).toHaveText(["月", "売上"])
  await expect(data.locator("td")).toHaveText(["1月", "12", "2月", "30"])
  const after = (await data.boundingBox())!
  expect(after.height).toBeGreaterThan(0)
  expect(after.width).not.toBe(before.width)
  // 表の中身は枠に収まり、スクロールバーは出ない
  const frame = data.locator("table").locator("..")
  expect(await frame.evaluate(e => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight)).toBe(true)
  // もう一度開くと今の表が出て、列を全部消して確定すると No Data に戻る
  await data.dblclick()
  await expect(dialog.getByLabel("列の名前").nth(1)).toHaveValue("売上")
  await dialog.getByRole("button", { name: "列を消す" }).nth(1).click()
  await dialog.getByRole("button", { name: "列を消す" }).nth(0).click()
  await expect(dialog.locator("tbody tr")).toHaveCount(0)
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(data).toHaveText("No Data")
})

// 編集のダイアログで、月（文字）と売上・目標（数）の表を入れる
async function fillMonths(page: Page, data: ReturnType<Page["locator"]>) {
  await data.dblclick()
  const dialog = page.getByRole("dialog", { name: "データの編集" })
  for (let i = 0; i < 3; i++) await dialog.getByRole("button", { name: "＋ 列を足す" }).click()
  const names = dialog.getByLabel("列の名前")
  await names.nth(0).fill("月")
  await dialog.getByLabel("列の型").nth(0).selectOption("text")
  await names.nth(1).fill("売上")
  await names.nth(2).fill("目標")
  const rows = [
    ["1月", "12", "15"],
    ["2月", "30", "20"],
    ["3月", "22", "25"],
  ]
  for (const _ of rows) await dialog.getByRole("button", { name: "＋ 行を足す" }).click()
  const cells = dialog.locator("tbody input")
  for (const [r, row] of rows.entries()) for (const [c, v] of row.entries()) await cells.nth(r * 3 + c).fill(v)
  return dialog
}

test("見た目を棒にすると横軸と値が既定で選ばれ、棒グラフになる。値を 2 つにすると凡例が出て、棒にポインタを乗せると値の吹き出しが出る。円・散布図・横向きの棒にも切り替えられる", async ({
  page,
}) => {
  await page.goto("/")
  const data = await addData(page)
  const dialog = await fillMonths(page, data)
  await dialog.getByLabel("見た目").selectOption("bar")
  await expect(dialog.getByLabel("横軸")).toHaveValue("0")
  await expect(dialog.getByRole("checkbox", { name: "売上" })).toBeChecked()
  await dialog.getByRole("checkbox", { name: "目標" }).check()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  const chart = data.getByRole("img", { name: "棒グラフ" })
  await expect(chart.locator("[data-bar]")).toHaveCount(6)
  await expect(chart.locator("[data-legend] text")).toHaveText(["売上", "目標"])
  await expect(chart.locator("[data-categories] text")).toHaveText(["1月", "2月", "3月"])
  await chart.locator("[data-bar]").nth(2).hover()
  const tip = data.getByRole("tooltip")
  await expect(tip).toContainText("2月")
  await expect(tip).toContainText("30")
  // 円: 値は 1 つ目の売上
  await data.dblclick()
  await dialog.getByLabel("見た目").selectOption("pie")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(data.getByRole("img", { name: "円グラフ" }).locator("[data-slice]")).toHaveCount(3)
  // 散布図: Y は円の値（売上）のままで、X は文字の月から、Y でない数の列（目標）に選び直す
  await data.dblclick()
  await dialog.getByLabel("見た目").selectOption("scatter")
  await expect(dialog.getByLabel("X", { exact: true })).toHaveValue("2")
  await expect(dialog.getByLabel("Y", { exact: true })).toHaveValue("1")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(data.getByRole("img", { name: "散布図" }).locator("[data-dot]")).toHaveCount(3)
  // 横向きの棒（横軸を月に戻す）
  await data.dblclick()
  await dialog.getByLabel("見た目").selectOption("bar")
  await dialog.getByLabel("横軸").selectOption({ label: "月" })
  await dialog.getByLabel("向き").selectOption("horizontal")
  await dialog.getByRole("button", { name: "確定" }).click()
  const bars = data.getByRole("img", { name: "棒グラフ" }).locator("[data-bar]")
  await expect(bars).toHaveCount(3)
  const first = (await bars.first().boundingBox())!
  expect(first.width).toBeGreaterThan(first.height)
})

test("表の列を消したり文字の列にしたりすると、その列の値の軸が外れ、値が無ければ確定を押せない", async ({ page }) => {
  await page.goto("/")
  const data = await addData(page)
  const dialog = await fillMonths(page, data)
  await dialog.getByLabel("見た目").selectOption("line")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(data.getByRole("img", { name: "折れ線グラフ" }).locator("[data-line]")).toHaveCount(1)
  // 値の列（売上）を消して、目標を文字の列にする
  await data.dblclick()
  await dialog.getByRole("button", { name: "列を消す" }).nth(1).click()
  await dialog.getByLabel("列の型").nth(1).selectOption("text")
  // 値が無いので確定を押せない
  await expect(dialog.getByRole("button", { name: "確定" })).toBeDisabled()
  await dialog.getByLabel("見た目").selectOption("table")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(data.locator("th")).toHaveText(["月", "目標"])
})

test("入りきらない項目の文字は傾けられ、選んでいる間は文字の領域のつまみで広げ縮めできる。「選んだ行だけ」なら、表の行の印の行の文字だけが出る", async ({
  page,
}) => {
  await page.goto("/")
  const data = await addData(page)
  const dialog = await fillMonths(page, data)
  await dialog.getByLabel("見た目").selectOption("bar")
  await dialog.getByLabel("入りきらない文字").selectOption("rotate")
  await dialog.getByRole("button", { name: "確定" }).click()
  const labels = data.locator("[data-categories] text")
  await expect(labels.first()).toHaveAttribute("transform", /rotate\(-45/)
  // 選んでいる間だけつまみが出る。上へドラッグすると文字の領域が広がり、描く所が低くなる
  await page.mouse.click(5, 5)
  await expect(data.locator("[data-label-grip]")).toHaveCount(0)
  await data.click()
  const grip = data.locator("[data-label-grip]")
  const before = (await grip.boundingBox())!
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2 - 10, { steps: 4 })
  await page.mouse.up()
  // 動かした量だけ広がる（ドラッグの途中で足し重ねない）
  await expect.poll(async () => Math.round(before.y - (await grip.boundingBox())!.y)).toBe(10)
  // 選んだ行だけ（2 行目の印）
  await data.dblclick()
  await dialog.getByLabel("入りきらない文字").selectOption("skip")
  await dialog.getByLabel("出す文字").selectOption("picked")
  await dialog.getByLabel("文字を出す").nth(1).check()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(labels).toHaveText(["2月"])
})
