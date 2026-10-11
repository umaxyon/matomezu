// 実際のブラウザのテストの補助。画面の要素から状態を読み、ユーザーと同じ操作（クリック、入力、ドラッグ）で動かす
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type Page, expect } from "@playwright/test";
import type { Diagram } from "../web/src/types";

const INDEX = pathToFileURL(resolve(import.meta.dirname, "../web/index.html")).href;

export const example = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../examples/${name}.json`), "utf8")) as Diagram;

export type Rect = { x: number; y: number; w: number; h: number };

// 画面を file:// で開き、「開く」のファイル選択から図を渡す
export async function openDiagram(page: Page, data: Diagram) {
  await page.goto(INDEX);
  await page.setInputFiles("#file", {
    name: "e2e.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator("#name")).toHaveText("e2e.json");
  await page.evaluate(() => document.fonts.ready);
}

const node = (page: Page, id: number) => page.locator(`.mz-node[data-id="${id}"]`);
const head = (page: Page, id: number) => node(page, id).locator(":scope > .mz-head");

// 箱の枠（親の左上からの位置と大きさ）
export function rect(page: Page, id: number): Promise<Rect> {
  return node(page, id).evaluate(el => {
    const s = (el as HTMLElement).style;
    return { x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
  });
}

// 箱の文字の行数（折り返していれば 2 以上）
export function lines(page: Page, id: number): Promise<number> {
  return head(page, id).evaluate(h => {
    const t = h.querySelector(".mz-text, .mz-caption")!;
    const range = document.createRange();
    range.selectNodeContents(t);
    return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
  });
}

// 線の両端（線の id で。線はポインタを乗せたり選んだりすると手前に描き直すので、並びの順番では探さない）
export function edgeEnds(page: Page, id: string): Promise<[number, number, number, number]> {
  return page.locator(`.mz-edge[data-id="${id}"] .mz-line`).evaluate(l => {
    const p = (l.getAttribute("points") ?? "").trim().split(/\s+/).map(q => q.split(",").map(Number));
    return [p[0]![0]!, p[0]![1]!, p.at(-1)![0]!, p.at(-1)![1]!] as [number, number, number, number];
  });
}

// 箱を選ぶ（本体をクリックする）
export async function select(page: Page, id: number) {
  await head(page, id).click();
  await expect(node(page, id)).toHaveClass(/mz-current/);
}

// キャプションを変える（サイドバーの鉛筆のボタンで編集ダイアログを開き、入力して確定する）
export async function setCaption(page: Page, id: number, text: string) {
  await select(page, id);
  await page.locator("#sidebar [data-edit-box]").click();
  await page.locator('.mz-dlg [name="caption"]').fill(text);
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
}

// サイドバーの切り替え（サイズ mzp-size、子の見せ方 mzp-view、ツリーの向き mzp-treedir。形はセレクトボックス）
export async function choose(page: Page, id: number, name: string, value: string) {
  await select(page, id);
  await page.locator(`#sidebar label:has(input[name="${name}"][value="${value}"])`).click();
}

// 箱の本体をつかんで (dx, dy) だけドラッグする。人がマウスで動かすのに近づけるため、5px ずつ動かす
// （大きく飛ばすと、途中でぶつかって止まるはずの箱を飛び越えてしまう）
export async function dragBy(page: Page, id: number, dx: number, dy: number) {
  const box = (await head(page, id).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: Math.max(1, Math.ceil(Math.hypot(dx, dy) / 5)) });
  await page.mouse.up();
}

// 崩れてはいけない性質（兄弟が重ならない、内包の子が親の余白の内側に収まる）を確かめ、問題を返す
export function violations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const rectOf = (n: HTMLElement) => ({
      x: parseFloat(n.style.left), y: parseFloat(n.style.top), w: parseFloat(n.style.width), h: parseFloat(n.style.height),
    });
    const apart = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) =>
      a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;
    const world = document.querySelector<HTMLElement>(".mz-world")!;
    const groups = [...document.querySelectorAll<HTMLElement>(".mz-node")]
      .filter(n => n.querySelector(":scope > .mz-head")!.classList.contains("mz-group"));
    for (const c of [world, ...groups]) {
      const kids = [...c.querySelectorAll<HTMLElement>(":scope > .mz-node")]
        .filter(n => n.style.display !== "none" && !n.classList.contains("mz-ghost"));
      const rects = kids.map(rectOf);
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        if (!apart(rects[i]!, rects[j]!)) out.push(`重なり: ${kids[i]!.dataset.id} / ${kids[j]!.dataset.id}`);
      }
      if (c === world) continue;
      const p = rectOf(c);
      for (const [i, r] of rects.entries()) {
        if (r.x < 11.5 || r.y < 29.5 || r.x + r.w > p.w - 11.5 || r.y + r.h > p.h - 11.5) {
          out.push(`はみ出し: ${kids[i]!.dataset.id}`);
        }
      }
    }
    return out;
  });
}
