import { expect, test } from "bun:test"
import { withPluginEnabled } from "../../../web/src/plugins/base/settings/enabled-plugins"

test("プラグインを有効にするとき、すでに有効なら重ねて足さない。無効にすると外す", () => {
  expect(withPluginEnabled(["@a/x"], "@a/x", true)).toEqual(["@a/x"])
  expect(withPluginEnabled(["@a/x", "@a/y"], "@a/x", false)).toEqual(["@a/y"])
})
