// ほかのホストの行: 常駐の様子の名前があればそれ、無ければペアリングしたときの名前。出す名前は常駐が決めたホストエイリアスで、様子がまだ無ければペアリングしたときの名前
import { expect, test } from "bun:test"
import { NOT_TOLD } from "../../../web/src/plugins/base/ui"
import { hostRows, ipOf } from "../../../web/src/plugins/network/hosts"

const record = (id: string, hostId: string, name: string) => ({
  id,
  hostId,
  nameAtPairing: name,
  userNameAtPairing: "",
  addr: "",
  pairedAt: "2026-11-23T00:00:00.000Z",
  requests: "ask-user" as const,
})

test("出す名前は常駐のホストエイリアス、名前は常駐の様子の今の名前を使い、様子が無ければペアリングしたときの名前", () => {
  const rows = hostRows(
    [record("p1", "b2c1".repeat(16), "old"), record("p2", "c".repeat(64), "mac")],
    [{ hostId: "b2c1".repeat(16), label: "win-lan · B2C1", name: "win-lan", userName: NOT_TOLD }],
    NOT_TOLD,
  )
  expect(rows.map(r => [r.label, r.name])).toEqual([
    ["win-lan · B2C1", "win-lan"],
    ["mac", "mac"],
  ])
})

test("番地:ポートから番地だけを取る（IPv6 の角括弧も外す）", () => {
  expect([ipOf("192.168.11.20:7240"), ipOf("[fe80::1]:7240")]).toEqual(["192.168.11.20", "fe80::1"])
})
