// 日本語の変換中（確定前の字）を、ブラウザの入力の口（CDP の Input.imeSetComposition）で作る
import type { Page } from "@playwright/test"

export async function imeCompose(page: Page, text: string) {
  const session = await page.context().newCDPSession(page)
  await session.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length })
  await session.detach()
}
