// ホストのペアリングの画面: 「ネットワーク」でホストとつなぐを入にすると、コントロールセンターに「ほかのホスト」が出る。
// ［＋］の「ホストをつなぐ」で待っている所を手で入れて頼むと、常駐が頼みに行き、届かなければその一言を出す。
// ほかのホストから届いた頼みは、しおりとダイアログに出て、断ると消える。常駐どうしの受け入れは Go のテストが確かめる
import { CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"
import { openSettings, settingsDialog } from "./helpers/settings"

const NOW = "2026-11-23T00:00:00.000Z"

async function connectHosts(page: Page) {
  await page.goto(CONTROL_CENTER_URL)
  await openSettings(page)
  const dialog = settingsDialog(page)
  await dialog.getByRole("tab", { name: "ネットワーク" }).click()
  await dialog.getByRole("switch", { name: "ホストとつなぐ" }).click()
  await dialog.getByRole("button", { name: "閉じる" }).click()
  await expect(page.getByText("ほかのホスト")).toBeVisible()
}

test("待っている所を手で入れて頼み、届かなければ「つながりません」。［やり直す］で選び直しに戻る", async ({ page }) => {
  await connectHosts(page)
  await page.getByRole("button", { name: "ホストをつなぐ" }).click()
  const dialog = page.getByRole("dialog", { name: "ホストをつなぐ" })
  await dialog.getByText("一覧に出ないときは、待っている所を入れる").click()
  await dialog.getByRole("textbox", { name: "待っている所" }).fill("127.0.0.1:1")
  await dialog.getByRole("button", { name: "つなぐ" }).click()
  await expect(dialog.getByText("つながりません")).toBeVisible({ timeout: 15000 })
  await dialog.getByRole("button", { name: "やり直す" }).click()
  await expect(dialog.getByText("見つかったホスト")).toBeVisible()
})

test("ほかのホストから届いた頼みはしおりに出て、ダイアログで断ると消える", async ({ page }) => {
  await connectHosts(page)
  await page.request.post("/api/perform", {
    data: {
      actions: [
        {
          action: "@matomezu/network:pairing-request-add",
          args: {
            hostId: "c".repeat(64),
            name: "masa-mac",
            userName: "masa",
            addr: "192.168.11.30:7240",
            code: "482913",
          },
          lang: "ja",
          now: NOW,
        },
      ],
    },
  })
  const bookmark = page.getByRole("button", { name: "ほかのホストからつなぐ頼みが届きました" })
  await bookmark.click()
  const dialog = page.getByRole("dialog", { name: "ほかのホストからつなぐ頼みが届きました" })
  await expect(dialog.getByText("482 913")).toBeVisible()
  await dialog.getByRole("button", { name: "断る" }).click()
  await expect(dialog).toBeHidden()
  await expect(bookmark).toBeHidden()
})

test("常駐が足したペアリングしたホストの頼みを「頼みとして受ける」に替えると、常駐に残り、読み直しても替わったまま", async ({
  page,
}) => {
  await connectHosts(page)
  await page.request.post("/api/perform", {
    data: {
      actions: [
        {
          action: "@matomezu/network:paired-host-add",
          args: {
            hostId: "a1c9".repeat(16),
            nameAtPairing: "win-lan",
            userNameAtPairing: "taro",
            addr: "192.168.11.20:7240",
          },
          lang: "ja",
          now: NOW,
        },
      ],
    },
  })
  // 頼みとして受けるは常駐の記録に残り、読み直しても替わったまま
  await page.getByRole("button", { name: /^つながっていない ?win-lan$/ }).click()
  await page.getByRole("radio", { name: "ユーザーの指示: あなたの指示と同じに扱う" }).click({ force: true }) // 押してもすぐは替わらない（確かめのダイアログが先）ので check でなく click
  await page
    .getByRole("dialog", { name: "このホストからの頼みを受ける" })
    .getByRole("button", { name: "頼みとして受ける" })
    .click()
  await page.reload()
  await page.getByRole("button", { name: /^つながっていない ?win-lan$/ }).click()
  await expect(page.getByRole("radio", { name: "ユーザーの指示: あなたの指示と同じに扱う" })).toBeChecked()
  // 目で AI 用ホストリストから隠すと、行に薄い斜線の入った目が出て、読み直しても隠したまま
  await page.getByRole("button", { name: "AI 用ホストリストから隠す" }).click()
  await expect(page.getByRole("img", { name: "AI 用ホストリストから隠しています" })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("img", { name: "AI 用ホストリストから隠しています" })).toBeVisible()
})
