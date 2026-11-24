// 変更提案郵便: 利用者が直している箱を AI が変えようとして断られ（being-edited）、変更を郵便で送る。利用者は郵便箱で郵便を選び、「場所を示す」で郵便箱を開いたまま
// 上の段で箱を見て、「反映」を押すと箱が変わり、選んだ郵便と受信トレイの行に「反映済み」が出る（読み直しても両方が残る）。ほかの窓でその箱を直している間は、反映を断ってトーストで知らせる
import { BOOK_SCREEN_URL, expect, joinedAiAuth, type Page, startingAtFirstBook, test } from "./fixtures"
import { aiPerform } from "./helpers/ai"
import { addBox, items } from "./helpers/paper"

const mailboxPane = (page: Page) => page.getByRole("region", { name: "郵便箱" })
const letter = (page: Page) => mailboxPane(page).locator("article")

async function ready(page: Page): Promise<{ book: string; page: string }> {
  const ai = await joinedAiAuth()
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const view = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as {
    entry: { id: string }
    page: string
  }
  return { book: view.entry.id, page: view.page }
}

test("断られた変更を変更提案郵便で送り、場所を示すで郵便箱を開いたまま箱を見せ、反映で箱が変わる。ほかの窓で直している間は反映を断る", async ({
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
  await expect.poll(async () => (await aiPerform(page, change)).reason).toBe("being-edited")
  const sent = await aiPerform(page, {
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
  // しおりから郵便箱を開くと、その郵便を選び、場所を示す・反映が並ぶ
  await page.getByRole("button", { name: "名前を直す", exact: true }).click()
  const mail = letter(page)
  await expect(mail).toContainText("箱の名前を AI に")
  await expect(mail.getByRole("button")).toHaveText(["場所を示す", "反映"])
  // 場所を示すと、郵便箱は開いたまま、箱に鳥が来る
  await mail.getByRole("button", { name: "場所を示す" }).click()
  await expect(page.locator("[data-mail-bird]")).toBeVisible()
  await expect(mail).toBeVisible()
  // ほかの窓でその箱を直している間は、反映を断ってトーストで知らせ、郵便は残す
  const other = startingAtFirstBook(await context.newPage())
  await other.goto(BOOK_SCREEN_URL)
  const otherEditing = other.getByRole("dialog", { name: "ボックスの編集" })
  await items(other).filter({ hasText: "一" }).dblclick()
  await expect(otherEditing).toBeVisible()
  await expect.poll(async () => (await aiPerform(page, change)).reason).toBe("being-edited")
  await page.bringToFront()
  await mail.getByRole("button", { name: "反映" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "直している最中です" })).toBeVisible()
  await expect(mail).toBeVisible()
  await expect(items(page).filter({ hasText: "一" })).toHaveCount(1)
  await other.keyboard.press("Escape")
  await expect(otherEditing).toHaveCount(0)
  await other.close()
  // 直し終えてから押すと反映され、郵便箱は閉じずに、選んだ郵便と受信トレイの行に反映済みが出る
  await expect.poll(async () => (await aiPerform(page, change)).ok).toBe(true)
  await aiPerform(page, {
    action: "@matomezu/paper:item-update",
    args: { item: box, props: { caption: "一" } },
    on: { page: at.page },
  })
  await expect(items(page).filter({ hasText: "一" })).toHaveCount(1)
  await mail.getByRole("button", { name: "反映" }).click()
  await expect(mail).toContainText("反映済み")
  await expect(items(page).filter({ hasText: "AI" })).toHaveCount(1)
  await expect(mailboxPane(page).getByRole("listitem")).toContainText("反映済み")
  // 反映と「反映した」は 1 回で書かれているので、読み直しても両方が残る
  await page.reload()
  await expect(items(page).filter({ hasText: "AI" })).toHaveCount(1)
  // 郵便箱のスクリーンは窓の場所に入っているので、読み直しても開いたまま
  await expect(mailboxPane(page).getByRole("listitem")).toContainText("反映済み")
})

test("コントロールセンターでしおりを押すと、コンテンツエリアの郵便箱でその郵便を選ぶ。変更提案郵便の「場所を示す」は、行き先のブックを新しいブックスクリーンで開く", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const at = await ready(page)
  await addBox(page, 300, 300, "一")
  const box = (await items(page).filter({ hasText: "一" }).getAttribute("data-item"))!
  const change = {
    action: "@matomezu/paper:item-update",
    args: { item: box, props: { caption: "AI" } },
    on: { page: at.page },
  }
  const sent = await aiPerform(page, {
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
  await page.goto("/")
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(0)
  await page.getByRole("button", { name: "名前を直す", exact: true }).click()
  await expect(page.getByRole("button", { name: "郵便箱", exact: true })).toHaveAttribute("aria-pressed", "true")
  await letter(page).getByRole("button", { name: "場所を示す" }).click()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(1)
  await expect(page.locator("[data-mail-bird]")).toBeVisible()
})
