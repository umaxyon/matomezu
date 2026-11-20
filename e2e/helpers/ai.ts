import type { Page } from "@playwright/test"
import { joinedAiAuth } from "../fixtures"

// AI の入口でアクション body（action・args・on）を 1 つ行い、答え（JSON）を返す。headers を渡さなければ、参加が確定した AI（joinedAiAuth）として行う
export const aiPerform = async (
  page: Page,
  body: { action: string; args: object; on?: object },
  headers?: Record<string, string>,
  // biome-ignore lint/suspicious/noExplicitAny: 答えの JSON を、テストごとの形で読む
): Promise<any> =>
  (await page.request.post("/api/ai/perform", { headers: headers ?? (await joinedAiAuth()), data: body })).json()
