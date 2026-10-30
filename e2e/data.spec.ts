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
