import type { Page } from "@playwright/test"

// 背景の帯（背景を置く・広げるときに出る）
export const band = (page: Page) => page.locator("[data-background-band]")
