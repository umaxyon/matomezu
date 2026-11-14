import { expect, test } from "bun:test"
import { withPluginEnabled } from "../../../web/src/plugins/base/settings/disabled-plugins"

test("プラグインを有効にすると外し、無効にすると末尾に足す（重ねて足さない）", () => {
  expect(withPluginEnabled(["@a/x"], "@a/y", false)).toEqual(["@a/x", "@a/y"])
  expect(withPluginEnabled(["@a/x", "@a/y"], "@a/x", true)).toEqual(["@a/y"])
  expect(withPluginEnabled(["@a/x"], "@a/x", false)).toEqual(["@a/x"])
})
