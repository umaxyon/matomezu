// 日本語の変換中（確定前の字）を、ブラウザの入力の口（CDP の Input.imeSetComposition）で作る。確定は imeCommit
import type { Page } from "@playwright/test"

export async function imeCompose(page: Page, text: string) {
  const session = await page.context().newCDPSession(page)
  await session.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length })
  await session.detach()
}

export async function imeCommit(page: Page, text: string) {
  const session = await page.context().newCDPSession(page)
  await session.send("Input.insertText", { text })
  await session.detach()
}
