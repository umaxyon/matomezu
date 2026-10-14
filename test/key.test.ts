// ボックスを短く示すキー（一覧の行や知らせに使う）
import { expect, test } from "bun:test";
import { keyOf, truncateWidth } from "../web/src/dom";

test("全角 8 文字分（半角 16 文字）までならそのまま、超えたら入るだけ残して … を付ける", () => {
  expect(keyOf(3, "ユーザー")).toBe("3_ユーザー");
  expect(keyOf(12, "東京都新宿区〇〇")).toBe("12_東京都新宿区〇〇");
  expect(keyOf(12, "東京都新宿区〇〇〇町のAさん")).toBe("12_東京都新宿区〇〇…");
  expect(keyOf(7, "Authentication Service")).toBe("7_Authentication S…");
  expect(keyOf(8, "API サーバー")).toBe("8_API サーバー"); // 半角 4 + 全角 4 = 12
  expect(truncateWidth("ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁ", 16)).toBe("ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀ…"); // 半角カナは半角
  expect(truncateWidth("😀😀😀😀😀😀😀😀😀", 16)).toBe("😀😀😀😀😀😀😀😀…"); // サロゲートペアも 1 文字
});

test("改行や続く空白は 1 つの空白にする", () => {
  expect(keyOf(1, "  上の段\n  下の段  ")).toBe("1_上の段 下の段");
});

