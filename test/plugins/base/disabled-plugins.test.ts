import { expect, test } from "bun:test"
import { disabledPluginIds, withPluginEnabled } from "../../../web/src/plugins/base/utils/disabled-plugins"

test("無効にしたプラグインの id の集合は、形に合わない値を無効なしとし、ビルトインプラグインを除く", () => {
  const builtin = new Set(["@matomezu/base"])
  expect([...disabledPluginIds(["@a/x", "@matomezu/base", 3, "@a/y"], builtin)]).toEqual(["@a/x", "@a/y"])
  expect([...disabledPluginIds("nope", builtin)]).toEqual([])
  expect([...disabledPluginIds(undefined, builtin)]).toEqual([])
})

test("プラグインを有効にすると外し、無効にすると末尾に足す（重ねて足さない）", () => {
  expect(withPluginEnabled(["@a/x"], "@a/y", false)).toEqual(["@a/x", "@a/y"])
  expect(withPluginEnabled(["@a/x", "@a/y"], "@a/x", true)).toEqual(["@a/y"])
  expect(withPluginEnabled(["@a/x"], "@a/x", false)).toEqual(["@a/x"])
})
