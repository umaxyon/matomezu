import { expect, test } from "bun:test"
import { withPluginEnabled } from "../../../web/src/plugins/base/settings/disabled-plugins"

test("プラグインを無効にするとき、すでに無効なら重ねて足さない", () => {
  expect(withPluginEnabled(["@a/x"], "@a/x", false)).toEqual(["@a/x"])
})
