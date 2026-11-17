// 変更提案郵便: 利用者が直している箱を AI が変えようとして断られ（being-edited）、変更を郵便で送る。利用者は郵便を開き、「場所を示す」で郵便を閉じずに
// 窓の右の端に寄せて箱を見て、「反映」を押すと箱が変わり、郵便箱の行に「反映済み」が出る（読み直しても両方が残る）。ほかの窓でその箱を直している間は、反映を断ってトーストで知らせる
import { BOOK_SCREEN_URL, expect, joinedAiAuth, type Page, test } from "./fixtures"
import { addBox, items } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const perform = async (page: Page, data: object) =>
  (await page.request.post("/api/ai/perform", { headers: await joinedAiAuth(), data })).json()

async function ready(page: Page): Promise<{ book: string; page: string }> {
  const ai = await joinedAiAuth()
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  return (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { book: string; page: string }
}

test("断られた変更を変更提案郵便で送り、場所を示すで郵便を右の端に寄せて箱を見せ、反映で箱が変わる。ほかの窓で直している間は反映を断る", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const at = await ready(page)
  await addBox(page, 300, 300, "一")
  const box = (await items(page).filter({ hasText: "一" }).getAttribute("data-item"))!
  // 利用者が箱の編集のダイアログを開いている間、AI はその箱を変えられない
  const editing = page.getByRole("dialog", { name: "ボックスの編集" })
  await items(page).filter({ hasText: "一" }).dblclick()
  await expect(editing).toBeVisible()
  const change = {
    action: "@matomezu/paper:item-update",
    args: { item: box, props: { caption: "AI" } },
    on: { page: at.page },
  }
  await expect.poll(async () => (await perform(page, change)).reason).toBe("being-edited")
  const sent = await perform(page, {
    action: "@matomezu/base:proposal-send",
    args: {
      from: "E51",
      title: "名前を直す",
      body: "箱の名前を AI に",
      book: at.book,
      page: at.page,
      changes: [change],
    },
  })
  expect(sent).toMatchObject({ ok: true })
  await page.keyboard.press("Escape")
  await expect(editing).toHaveCount(0)
  // 郵便を開くと、閉じる・場所を示す・反映が並ぶ
  await page.getByRole("button", { name: "名前を直す" }).click()
  const mail = page.getByRole("dialog", { name: "名前を直す" })
  await expect(mail).toContainText("箱の名前を AI に")
  await expect(mail.getByRole("button")).toHaveText(["閉じる", "場所を示す", "反映"])
  // 場所を示すと、郵便は閉じずに右の端に寄り、箱に鳥が来る
  await mail.getByRole("button", { name: "場所を示す" }).click()
  await expect(mail).toHaveAttribute("data-docked", "true")
  await expect(page.locator("[data-mail-bird]")).toBeVisible()
  const dialogBox = (await mail.boundingBox())!
  expect(dialogBox.x + dialogBox.width).toBeGreaterThan((page.viewportSize()?.width ?? 0) - 40)
  // ほかの窓でその箱を直している間は、反映を断ってトーストで知らせ、郵便は残す
  const other = await context.newPage()
  await other.goto(BOOK_SCREEN_URL)
  const otherEditing = other.getByRole("dialog", { name: "ボックスの編集" })
  await items(other).filter({ hasText: "一" }).dblclick()
  await expect(otherEditing).toBeVisible()
  await expect.poll(async () => (await perform(page, change)).reason).toBe("being-edited")
  await page.bringToFront()
  await mail.getByRole("button", { name: "反映" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "直している最中です" })).toBeVisible()
  await expect(mail).toBeVisible()
  await expect(items(page).filter({ hasText: "一" })).toHaveCount(1)
  await other.keyboard.press("Escape")
  await expect(otherEditing).toHaveCount(0)
  await other.close()
  // 直し終えてから押すと反映され、郵便は閉じ、郵便箱の行に反映済みが出る
  await expect.poll(async () => (await perform(page, change)).ok).toBe(true)
  await perform(page, {
    action: "@matomezu/paper:item-update",
    args: { item: box, props: { caption: "一" } },
    on: { page: at.page },
  })
  await expect(items(page).filter({ hasText: "一" })).toHaveCount(1)
  await mail.getByRole("button", { name: "反映" }).click()
  await expect(mail).toHaveCount(0)
  await expect(items(page).filter({ hasText: "AI" })).toHaveCount(1)
  await (await fromMenu(page, "左サイドパネルを開く")).click()
  await expect(page.getByRole("complementary", { name: "左サイドパネル" })).toContainText("反映済み")
  // 反映と「反映した」は 1 回で書かれているので、読み直しても両方が残る
  await page.reload()
  await expect(items(page).filter({ hasText: "AI" })).toHaveCount(1)
  await (await fromMenu(page, "左サイドパネルを開く")).click()
  await expect(page.getByRole("complementary", { name: "左サイドパネル" })).toContainText("反映済み")
})
