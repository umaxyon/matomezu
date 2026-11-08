// 検索（base の検索ダイアログ。探せるのはマークダウンのブック）: Mod+F で開き、打つと当たりを数えて光らせ、次・前へ移り、置き換え、閉じると今の当たりを選ぶ。
// ブック全体の検索は、当たりのある次のページを開いて移る。ダイアログは見出しを掴んで動かせる
import { expect, type Page, test } from "./fixtures"
import { newBook } from "./helpers/new-book"

// マスターでマークダウンのブックを作り、ページの原文を text にする
async function markdownBook(page: Page, text: string) {
  await page.goto("/")
  const add = await newBook(page, "メモ", "マークダウン")
  await add.getByRole("button", { name: "作成" }).click()
  await page.getByRole("region", { name: "ソース" }).getByRole("textbox").click()
  await page.keyboard.insertText(text)
  await expect(page.getByRole("region", { name: "プレビュー" })).toContainText(text.split("\n")[0]!.replace(/^# /, ""))
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "検索ダイアログ" })
const lit = (page: Page, name: string) => page.evaluate(n => CSS.highlights.get(n)?.size ?? 0, name)

const count = (page: Page) => dialog(page).locator("[data-search-count]")
const source = (page: Page) => page.getByRole("region", { name: "ソース" }).getByRole("textbox")

test("Mod+F で開き、打つと当たりを数えて両方のペインで光らせ、Enter・Shift+Enter で次・前へ移り、Esc で閉じると今の当たりを選んで書ける", async ({
  page,
}) => {
  await markdownBook(page, "# 猫の話\n\n猫が好き。**猫**は丸い。\n\n犬より猫。")
  await page.keyboard.press("ControlOrMeta+f")
  await expect(dialog(page)).toBeVisible()
  // 1 字ずつ打っても、打った字は残る（打つたびに焦点を当て直して選ばない）
  await page.keyboard.type("猫が")
  await expect(dialog(page).getByLabel("探す")).toHaveValue("猫が")
  await expect(count(page)).toHaveText("1/1")
  // 字を変えても、今の当たりは今の所の頭から選び直す（「猫が」の当たりの「猫」のまま）
  await page.keyboard.press("Backspace")
  await expect(count(page)).toHaveText("2/4")
  await page.keyboard.press("Shift+Enter")
  await expect(count(page)).toHaveText("1/4")
  // 当たり 4 つを、ソース（4）とプレビュー（4）で光らせる。今の当たりは両方で 1 つずつ
  await expect.poll(() => lit(page, "matomezu-search")).toBe(8)
  await expect.poll(() => lit(page, "matomezu-search-current")).toBe(2)
  await page.keyboard.press("Enter")
  await expect(count(page)).toHaveText("2/4")
  await page.keyboard.press("Shift+Enter")
  await page.keyboard.press("Shift+Enter")
  await expect(count(page)).toHaveText("4/4")
  await page.keyboard.press("Escape")
  await expect(dialog(page)).toHaveCount(0)
  await expect.poll(() => lit(page, "matomezu-search")).toBe(0)
  // 今の当たり（最後の「猫」）を選んでいるので、打つと置き換わる
  await page.keyboard.type("犬")
  await expect(source(page)).toHaveValue("# 猫の話\n\n猫が好き。**猫**は丸い。\n\n犬より犬。")
})

test("Mod+Alt+F は置換の入力Formから始め、1 つ置換は今の当たりだけ、全部置換は全部を替える。正規表現が読めないと 0/0", async ({
  page,
}) => {
  await markdownBook(page, "cat cat cat")
  await page.keyboard.press("ControlOrMeta+Alt+f")
  await expect(dialog(page).getByLabel("置換")).toBeFocused()
  // 置換の入力Formで 1 字ずつ打っても、焦点は置換の入力Formのまま
  await page.keyboard.type("dog")
  await expect(dialog(page).getByLabel("置換")).toBeFocused()
  await expect(dialog(page).getByLabel("置換")).toHaveValue("dog")
  await dialog(page).getByLabel("探す").fill("cat")
  await expect(count(page)).toHaveText("1/3")
  await dialog(page).getByRole("button", { name: "1 つ置換" }).click()
  await expect(source(page)).toHaveValue("dog cat cat")
  await expect(count(page)).toHaveText("1/2")
  await dialog(page).getByRole("button", { name: "全部置換" }).click()
  await expect(source(page)).toHaveValue("dog dog dog")
  await dialog(page).getByLabel("正規表現").check()
  await dialog(page).getByLabel("探す").fill("(")
  await expect(count(page)).toHaveText("0/0")
  await expect(dialog(page).getByLabel("探す")).toHaveAttribute("aria-invalid", "true")
})

test("ブック全体では、当たりのある次のページを開いて移る。見出しを掴んで動かした所は、閉じて開き直しても同じ", async ({
  page,
}) => {
  await markdownBook(page, "一枚目に 猫")
  await page.getByRole("button", { name: "ページを足す" }).click()
  await page.getByRole("dialog", { name: "新しいページ" }).getByRole("button", { name: "作成" }).click()
  await source(page).click()
  await page.keyboard.insertText("二枚目にも 猫")
  await page.getByRole("tab", { name: "ページ 1" }).click()
  await expect(source(page)).toHaveValue("一枚目に 猫")
  await page.keyboard.press("ControlOrMeta+Shift+f")
  await page.keyboard.insertText("猫")
  await expect(count(page)).toHaveText("1/2（1 / 2）")
  await page.keyboard.press("Enter")
  await expect(count(page)).toHaveText("2/2（2 / 2）")
  await expect(source(page)).toHaveValue("二枚目にも 猫")
  // 見出しを掴んで動かす
  const head = dialog(page).getByText("検索", { exact: true })
  const at = (await head.boundingBox())!
  await page.mouse.move(at.x + 5, at.y + 5)
  await page.mouse.down()
  await page.mouse.move(at.x - 300, at.y + 200, { steps: 5 })
  await page.mouse.up()
  const moved = (await dialog(page).boundingBox())!
  await page.keyboard.press("Escape")
  await page.keyboard.press("ControlOrMeta+f")
  const again = (await dialog(page).boundingBox())!
  expect([Math.round(again.x), Math.round(again.y)]).toEqual([Math.round(moved.x), Math.round(moved.y)])
})
