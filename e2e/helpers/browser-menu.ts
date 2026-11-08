import type { Locator } from "@playwright/test"

// locator の物に右クリック（contextmenu）を送り、既定の動き（ブラウザのメニュー）が止められたかを返す
export const browserMenuStopped = (target: Locator) =>
  target.evaluate(el => !el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })))
