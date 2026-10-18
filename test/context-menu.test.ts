// 右クリックのメニュー（context-menu.ts。D42）: 既定のメニューに、パターンの決まり（STRATEGIES の menu）を重ねる
import { expect, test } from "bun:test";
import { applyRules, finish, type Row } from "../web/src/context-menu";
import { STRATEGIES } from "../web/src/model";

const item = (id: string, label = id): Row => ({ id: id as never, label, enabled: true, run: () => {} });
const base = (): Row[] => [item("settings"), "hr", item("cut"), item("copy"), item("paste"), "hr", item("remove")];
const labels = (rows: Row[]) => finish(rows).map(x => (x === "hr" ? "|" : x.label));

test("決まりが無ければ既定のまま", () => {
  expect(labels(applyRules(base(), [{}]))).toEqual(["settings", "|", "cut", "copy", "paste", "|", "remove"]);
});

test("出さない項目は消え、先頭・末尾・続けての区切り線は残さない", () => {
  expect(labels(applyRules(base(), [{ hide: ["settings"] }]))).toEqual(["cut", "copy", "paste", "|", "remove"]);
  expect(labels(applyRules(base(), [{ hide: ["cut", "copy", "paste", "remove"] }]))).toEqual(["settings"]);
});

test("差し替えは見出しとショートカットを保ち、動きと使えるかを変える。追加は指定の項目の後ろ（null は一番上）", () => {
  const rows = applyRules([{ id: "settings", label: "設定", key: "Enter", enabled: false, run: () => {} }, "hr", item("remove")],
    [{ override: { settings: "appSettings" }, add: [{ action: "appSettings", after: "remove" }, { action: "appSettings", after: null }] }]);
  const s = rows[1] as Exclude<Row, "hr">;
  expect([s.label, s.key, s.enabled]).toEqual(["設定", "Enter", true]);
  expect(labels(rows)).toEqual(["設定", "設定", "|", "remove", "設定"]);
  // 足す先の項目が無ければ足さない
  expect(labels(applyRules([item("remove")], [{ add: [{ action: "appSettings", after: "heads" }] }]))).toEqual(["remove"]);
});

test("決まりは順に重ねる（窓は箱の決まりの上に窓の決まり）", () => {
  expect(labels(applyRules(base(), [{ hide: ["cut"] }, { hide: ["settings"] }]))).toEqual(["copy", "paste", "|", "remove"]);
});

test("マスター: 窓は設定を出さず、背景の設定は全体の設定。ほかのパターンは既定のまま", () => {
  expect(STRATEGIES.master.menu).toEqual({ window: { hide: ["settings"] }, world: { override: { settings: "appSettings" } } });
  for (const v of ["nest", "tree", "flow"] as const) expect(STRATEGIES[v].menu).toEqual({});
});
