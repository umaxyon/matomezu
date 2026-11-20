import { BOOK_SCREEN_URL, expect, test } from "../fixtures"

// 画面 cookie を持たないブラウザは、画面の入口（データも perform も）を断られ、画面に開き方の案内が出る。コードで画面 cookie を渡すと使える
test("画面 cookie を持たないブラウザは断られ、画面 cookie を渡すと使える", async ({ browser, host }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  expect((await page.request.get(`${host.url}/api/data`)).status()).toBe(403)
  expect((await page.request.post(`${host.url}/api/perform`, { data: {} })).status()).toBe(403)
  await page.goto(`${host.url}${BOOK_SCREEN_URL}`)
  await expect(page.getByRole("heading", { name: "matomezu の開き方" })).toBeVisible()
  await expect(page).toHaveTitle("matomezu の開き方")
  await expect(page.getByText(/^\$ matomezu open$/)).toBeVisible()
  // コピーを押すと、コマンドがクリップボードに入り、ボタンの字がしばらく替わる
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: host.url })
  await page.getByRole("button", { name: "コピー" }).click()
  await expect(page.getByRole("button", { name: "コピーしました" })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("matomezu open")
  await expect(page.getByRole("button", { name: "コピー", exact: true })).toBeVisible()

  const made = await fetch(`${host.url}/api/cookie-code-for-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  const { code } = (await made.json()) as { code: string }
  await page.goto(`${host.url}/cookie?code=${code}`)
  await expect(page).not.toHaveURL(/cookie/)
  expect((await page.request.get(`${host.url}/api/data`)).status()).toBe(200)
  // 使ったコードはもう使えない
  expect((await page.request.get(`${host.url}/cookie?code=${code}`, { maxRedirects: 0 })).status()).toBe(403)
  await context.close()
})
