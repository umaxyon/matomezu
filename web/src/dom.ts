// DOM まわりの小さな道具

export const SVGNS = "http://www.w3.org/2000/svg";

export function injectStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

// どんな色指定でも、ブラウザに解釈させて [r, g, b] にする
function rgbOf(color: string): number[] {
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
