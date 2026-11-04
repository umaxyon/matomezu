// 画面が 2 コマ描き終えるまで待つ。起きないはずの事が起きていないと確かめる前に、起きるならもう起きている所まで進める
import type { Page } from "@playwright/test"

export const afterFrames = (page: Page) =>
  page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
