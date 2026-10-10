// DOM まわりの小さな道具

export const SVGNS = "http://www.w3.org/2000/svg";

export function injectStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

// どんな色指定でも、ブラウザに解釈させて [r, g, b] にする。
// 解釈には一時的な要素を画面に足してスタイルを計算させるので、同じ色の結果は覚えておく
const rgbCache = new Map<string, number[]>();
function rgbOf(color: string): number[] {
  const hit = rgbCache.get(color);
  if (hit) return hit;
  const rgb = parseColor(color);
  if (rgbCache.size > 500) rgbCache.clear();
  rgbCache.set(color, rgb);
  return rgb;
}

function parseColor(color: string): number[] {
  const probe = document.createElement("span");
  probe.style.color = color;
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g) ?? ["255", "255", "255"];
  probe.remove();
  return m.slice(0, 3).map(Number);
}

// 背景色が明るければ文字を暗くする
export function isLightColor(color: string): boolean {
  const [r = 255, g = 255, b = 255] = rgbOf(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

// input[type=color] は #rrggbb しか受け付けないので変換する
export function toHex(color: string): string {
  return "#" + rgbOf(color).map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
}

// limit 文字を超えたら先頭 limit 文字 + … にする（サロゲートペアも1文字と数える）
export function truncate(text: string, limit?: number): string {
  if (!limit) return text;
  const chars = Array.from(text);
  return chars.length > limit ? chars.slice(0, limit).join("") + "…" : text;
}

// 見た目の幅（半角 1、全角 2）で limit を超えたら、入るだけ残して … を付ける
export function truncateWidth(text: string, limit: number): string {
  let used = 0, out = "";
  for (const c of text) {
    const cp = c.codePointAt(0)!;
    const w = cp < 0x100 || (cp >= 0xff61 && cp <= 0xff9f) ? 1 : 2; // Latin-1 と半角カナは半角
    if (used + w > limit) return out + "…";
    used += w;
    out += c;
  }
  return out;
}

// キャプションが空の箱を、一覧などで示す文字
export const EMPTY_CAPTION = "(空)";

// ボックスを短く示すキー: 「id_キャプションの先頭（全角 8 文字分、半角なら 16 文字）」。超えたら … を付ける。
// 同じ書き出しのボックスが並んでも見分けられるよう id を付ける。改行や続く空白は 1 つの空白にする。空なら「id_(空)」
export const keyOf = (id: unknown, caption: string) =>
  `${id}_${truncateWidth(caption.replace(/\s+/g, " ").trim(), 16) || EMPTY_CAPTION}`;

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// データを JSON ファイルとしてダウンロードさせる
export function download(data: unknown, filename = "matomezu.json"): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// File（input[type=file] やドロップ）から JSON を読む
export async function readFile(file: File): Promise<unknown> {
  return JSON.parse(await file.text());
}
