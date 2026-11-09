import { BOOK_SCREEN_URL, expect, test } from "../fixtures"

// ペアを組んでいないブラウザは、画面の入口（データも perform も）を断られ、画面にペアが要ると出る。コードで組むと使える
test("ペアを組んでいないブラウザは断られ、ペアを組むと使える", async ({ browser, host }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  expect((await page.request.get(`${host.url}/api/data`)).status()).toBe(403)
  expect((await page.request.post(`${host.url}/api/perform`, { data: {} })).status()).toBe(403)
  await page.goto(`${host.url}${BOOK_SCREEN_URL}`)
  await expect(page.getByText("ターミナルで matomezu open を実行してください")).toBeVisible()

  const made = await fetch(`${host.url}/api/pair-code-for-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  const { code } = (await made.json()) as { code: string }
  await page.goto(`${host.url}/pair?code=${code}`)
  await expect(page).not.toHaveURL(/pair/)
  expect((await page.request.get(`${host.url}/api/data`)).status()).toBe(200)
  // 使ったコードはもう使えない
  expect((await page.request.get(`${host.url}/pair?code=${code}`, { maxRedirects: 0 })).status()).toBe(403)
  await context.close()
})
