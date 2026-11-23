// ほかのホストの行: 常駐の様子の名前があればそれ、無ければペアリングしたときの名前。同じ名前が 2 つ以上なら鍵の印の頭 4 字を添える
import { expect, test } from "bun:test"
import { NOT_TOLD } from "../../../web/src/plugins/base/ui"
import { hostRows, ipOf, shownName } from "../../../web/src/plugins/network/hosts"

const record = (id: string, hostId: string, name: string) => ({
  id,
  hostId,
  nameAtPairing: name,
  userNameAtPairing: "",
  addr: "",
  pairedAt: "2026-11-23T00:00:00.000Z",
})

test("同じ名前のホストにだけ鍵の印の頭 4 字を添え、常駐の様子の今の名前を使う", () => {
  const rows = hostRows(
    [
      record("p1", "7f3a".repeat(16), "win-lan"),
      record("p2", "b2c1".repeat(16), "old"),
      record("p3", "c".repeat(64), "mac"),
    ],
    [{ hostId: "b2c1".repeat(16), name: "win-lan", userName: NOT_TOLD }],
    NOT_TOLD,
  )
  expect(rows.map(r => shownName(r, rows))).toEqual(["win-lan · 7F3A", "win-lan · B2C1", "mac"])
})

test("番地:ポートから番地だけを取る（IPv6 の角括弧も外す）", () => {
  expect([ipOf("192.168.11.20:7240"), ipOf("[fe80::1]:7240")]).toEqual(["192.168.11.20", "fe80::1"])
})
