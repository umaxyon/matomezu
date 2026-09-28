// docs/LAYOUT-PENDING.md の保留を、実際のブラウザで再現手順どおりに操作し、手順ごとの画面を撮る（合否は判定しない）。
// 仕分けのときに「本当に起きるか」「気になるか」を見るためのもの。bun run e2e:shots で動かす（普段の e2e では飛ばす）。
// 画面は docs/pending-shots/<番号>-<手順>.png、箱の位置と大きさは docs/pending-shots/rects.md に書く
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Page, test } from "@playwright/test";
import { choose, dragBy, example, openDiagram, rect, setCaption } from "./helpers";

const OUT = resolve(import.meta.dirname, "../docs/pending-shots");
const LONG = "とても長い名前のユーザーのボックスあいうえおかきくけこ";

test.skip(!process.env.SHOTS, "bun run e2e:shots のときだけ動かす");

// 番号、内容、見る箱（id: 名前）、手順（名前と操作）
type Step = [string, (page: Page) => Promise<void>];
const scenarios: { no: number; title: string; watch: Record<number, string>; steps: Step[] }[] = [
  {
    no: 1, title: "大きい隣にぶつかって自分がずれた分は、縮んでも戻らない",
    watch: { 2: "ユーザー", 3: "フロントエンド" },
    steps: [
      ["ユーザーに長い文字", p => setCaption(p, 2, LONG)],
      ["サイズを S", p => choose(p, 2, "mzp-size", "S")],
      ["サイズを M に戻す", p => choose(p, 2, "mzp-size", "M")],
      ["文字を戻す", p => setCaption(p, 2, "ユーザー")],
    ],
  },
  {
    no: 2, title: "ワールドの左端近くの箱は、最初の1回だけ中心がずれる",
    watch: { 2: "ユーザー" },
    steps: [
      ["ユーザーに長い文字", p => setCaption(p, 2, "ユーザー" + LONG.repeat(2))],
      ["文字を戻す", p => setCaption(p, 2, "ユーザー")],
      ["もう一度長い文字", p => setCaption(p, 2, "ユーザー" + LONG.repeat(2))],
      ["もう一度戻す", p => setCaption(p, 2, "ユーザー")],
    ],
  },
  {
    no: 3, title: "開いたときの押し下げでも元の位置を覚える（関係ない操作で上へ詰まる）",
    watch: { 1: "タイトル", 3: "フロントエンド", 10: "バックエンド" },
    steps: [
      ["フロントエンドを非表示", p => choose(p, 3, "mzp-view", "hidden")],
      ["外部サービスを内包", p => choose(p, 17, "mzp-view", "nest")],
      ["フロントエンドを内包に戻す", p => choose(p, 3, "mzp-view", "nest")],
      ["外部サービスを非表示", p => choose(p, 17, "mzp-view", "hidden")],
    ],
  },
  {
    no: 4, title: "ドラッグの押し方（pushAway）とほかの場面の押し方（slide）の違い",
    watch: { 4: "Web", 7: "モバイル", 10: "バックエンド" },
    steps: [
      ["トップ画面を右下へドラッグ（Web が広がり、隣を押す）", p => dragBy(p, 5, 150, 120)],
      ["トップ画面の文字を長くする（設定変更で広がり、隣を押す）", p => setCaption(p, 5, LONG.repeat(3))],
    ],
  },
  {
    no: 6, title: "ドラッグで押した相手は、離れても戻らない",
    watch: { 4: "Web", 7: "モバイル", 10: "バックエンド" },
    steps: [
      ["トップ画面を下へドラッグ（Web とフロントエンドが伸び、バックエンドを押す）", p => dragBy(p, 5, 0, 200)],
      ["トップ画面を元の高さへドラッグで戻す", p => dragBy(p, 5, 0, -200)],
    ],
  },
  {
    no: 7, title: "押し下げられた位置が保存され、Undo・Redo のあとは上がらない",
    watch: { 5: "トップ画面", 6: "カート画面" },
    steps: [
      ["トップ画面の文字を長くする（カート画面を押し下げる）", p => setCaption(p, 5, LONG.repeat(3))],
      ["Undo", p => p.locator("#undo").click()],
      ["Redo（データから作り直す）", p => p.locator("#redo").click()],
      ["トップ画面の文字を戻す", p => setCaption(p, 5, "トップ画面")],
    ],
  },
];

const report: string[] = [];
test.afterAll(() => {
  writeFileSync(resolve(OUT, "rects.md"),
    "# 保留の再現: 手順ごとの箱の位置と大きさ（x, y, 幅, 高さ。親の左上から）\n\n" + report.join("\n"));
});

for (const s of scenarios) {
  test(`${s.no}. ${s.title}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await openDiagram(page, example("three-levels"));
    const lines = [`## ${s.no}. ${s.title}`, "", "| 手順 | " + Object.values(s.watch).join(" | ") + " |",
      "|---|" + Object.keys(s.watch).map(() => "---").join("|") + "|"];
    const shoot = async (i: number, name: string) => {
      await page.mouse.move(0, 0); // ポインタを乗せたときの薄い表示を消す
      await page.locator("#stage").screenshot({ path: resolve(OUT, `${s.no}-${i}.png`) });
      const cells = [];
      for (const id of Object.keys(s.watch)) {
        const r = await rect(page, Number(id));
        cells.push([r.x, r.y, r.w, r.h].map(Math.round).join(", "));
      }
      lines.push(`| ${i}. ${name}（${s.no}-${i}.png） | ${cells.join(" | ")} |`);
    };
    await shoot(0, "開いた直後");
    for (const [i, [name, run]] of s.steps.entries()) {
      await run(page);
      await shoot(i + 1, name);
    }
    report.push(lines.join("\n") + "\n");
  });
}
