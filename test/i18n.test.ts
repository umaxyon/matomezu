// 多言語対応の漏れを見つける（docs/I18N-plan.md）。
// - web/src の文字列で日本語を含むものは、t("…") のキーか、i18n-ok の印を付けた行だけ
// - t のキーと index.html の文言は、どれも英語の辞書にある。差し込む {name} も訳と合う
import { describe, expect, spyOn, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { browserLang, langSetting, setLang, setLangSetting, t, translateDom } from "../web/src/i18n";
import { EN, PARTS } from "../web/src/i18n/en";
import { closeEditDialog } from "../web/src/edit-dialog";
import { openSettings } from "../web/src/settings";

const SRC = join(import.meta.dir, "../web/src");
const JA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function sources(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? (d.name === "i18n" ? [] : sources(join(dir, d.name))) : d.name.endsWith(".ts") ? [join(dir, d.name)] : []);
}

// ファイルの中の、日本語を含む文字列（t のキーかどうかと、行の番号）。コメント・文字列・テンプレート・正規表現を読み分ける
// （typescript 7 には JS の API が無いので、自前で読む）
function strings(file: string) {
  const src = readFileSync(file, "utf8"), n = src.length;
  const lines = src.split("\n");
  const lineOf = (i: number) => src.slice(0, i).split("\n").length;
  const out: { text: string; key: boolean; line: number; ok: boolean }[] = [];
  const unescape = (raw: string) => raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/gs, (_, e: string) =>
    e[0] === "u" || e[0] === "x" ? String.fromCodePoint(parseInt(e.replace(/[ux{}]/g, ""), 16))
      : ({ n: "\n", t: "\t", r: "\r", "\n": "" } as Record<string, string>)[e] ?? e);
  // 直前が t( なら、キー
  const afterT = (i: number) => /(^|[^\w$.])t\(\s*$/.test(src.slice(Math.max(0, i - 40), i));
  const push = (start: number, raw: string, key: boolean) => {
    const text = unescape(raw);
    if (!JA.test(text)) return;
    const line = lineOf(start);
    out.push({ text, key, line, ok: /i18n-ok/.test(lines[line - 1] ?? "") });
  };
  const stack: number[] = []; // テンプレートの ${ を開いたときの { の深さ
  let depth = 0, last = "";   // last は直前の意味のある文字（/ が割り算か正規表現かを見分ける）
  // テンプレートの文字の部分を読む（i は ` か } の次）。終わりの ` か ${ の位置を返す
  const template = (i: number, start: number, first: boolean): number => {
    let j = i;
    while (j < n && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) j += src[j] === "\\" ? 2 : 1;
    const whole = first && src[j] === "`";
    push(start, src.slice(i, j), whole && afterT(start));
    if (src[j] === "`") return j + 1;
    stack.push(depth++);
    return j + 2;
  };
  let i = 0;
  while (i < n) {
    const c = src[i]!;
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2); i = i < 0 ? n : i + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      push(i, src.slice(i + 1, j), afterT(i));
      i = j + 1; last = c; continue;
    }
    if (c === "`") { i = template(i + 1, i, true); last = "`"; continue; }
    if (c === "/" && (last === "" || "(,=:[!&|?{};+-*%<>~^".includes(last))) {
      // 正規表現。[] の中の / は終わりにしない
      let j = i + 1, cls = false;
      while (j < n && src[j] !== "\n" && (cls || src[j] !== "/")) {
        if (src[j] === "\\") j++;
        else if (src[j] === "[") cls = true;
        else if (src[j] === "]") cls = false;
        j++;
      }
      i = j + 1; last = "/"; continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      if (stack.length && stack[stack.length - 1] === depth - 1) { stack.pop(); depth--; i = template(i + 1, i, false); last = "`"; continue; }
      depth--;
    }
    if (!/\s/.test(c)) last = /[\w$]/.test(c) ? "a" : c;
    i++;
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe("多言語対応", () => {
  const all = sources().map(f => ({ file: f.slice(SRC.length + 1), list: strings(f) }));

  test("日本語の文字列は t のキーにする（わざと残すものは行に i18n-ok）", () => {
    const left = all.flatMap(({ file, list }) => list.filter(s => !s.key && !s.ok).map(s => `${file}:${s.line} ${s.text.slice(0, 40)}`));
    expect(left).toEqual([]);
  });

  test("t のキーはどれも英語の辞書にあり、差し込む値の名前も合う", () => {
    const keys = all.flatMap(({ list }) => list.filter(s => s.key).map(s => s.text));
    expect(keys.filter(k => EN[k] == null)).toEqual([]);
    const bad = Object.entries(EN).filter(([k, v]) => placeholders(k).join() !== placeholders(v).join()).map(([k]) => k);
    expect(bad).toEqual([]);
    expect(Object.values(EN).filter(v => JA.test(v))).toEqual([]);
  });

  test("英語の辞書のキーは、どれも t のキーか index.html の文言として使っている（使わなくなった訳を残さない）", () => {
    const used = new Set(all.flatMap(({ list }) => list.filter(s => s.key).map(s => s.text)));
    const html = new DOMParser().parseFromString(readFileSync(join(import.meta.dir, "../web/index.html"), "utf8"), "text/html");
    const walk = (n: Node) => {
      if (n instanceof Element) {
        if (n.tagName === "SCRIPT" || n.tagName === "STYLE") return;
        for (const a of ["title", "aria-label", "placeholder"]) { const v = n.getAttribute(a); if (v) used.add(v); }
      } else if (n.nodeType === Node.TEXT_NODE && n.nodeValue?.trim()) used.add(n.nodeValue.trim());
      n.childNodes.forEach(walk);
    };
    walk(html.body);
    // 日本語の文字（漢字・かな）を含まないキー（「、」など）は strings で拾わないので、t("…") の書き方をそのまま探す
    const src = sources().map(f => readFileSync(f, "utf8")).join("\n");
    const literal = (k: string) => !JA.test(k) && src.includes(`t(${JSON.stringify(k)}`);
    expect(Object.keys(EN).filter(k => !used.has(k) && !literal(k))).toEqual([]);
  });

  test("同じキーが 2 つの辞書にあれば、同じ訳", () => {
    const seen = new Map<string, string>(), diff: string[] = [];
    for (const part of Object.values(PARTS)) {
      for (const [k, v] of Object.entries(part)) {
        if (seen.has(k) && seen.get(k) !== v) diff.push(k);
        seen.set(k, v);
      }
    }
    expect(diff).toEqual([]);
  });

  test("index.html の文言はどれも英語の辞書にあり、translateDom で英語になる", () => {
    const html = readFileSync(join(import.meta.dir, "../web/index.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");
    setLang("en");
    try {
      translateDom(doc.body);
    } finally {
      setLang("ja");
    }
    const left: string[] = [];
    const walk = (n: Node) => {
      if (n instanceof Element) {
        if (n.tagName === "SCRIPT" || n.tagName === "STYLE") return;
        for (const a of ["title", "aria-label", "placeholder"]) {
          const v = n.getAttribute(a);
          if (v && JA.test(v)) left.push(v);
        }
      } else if (n.nodeType === Node.TEXT_NODE && JA.test(n.nodeValue ?? "")) left.push(n.nodeValue!.trim());
      n.childNodes.forEach(walk);
    };
    walk(doc.body);
    expect(left).toEqual([]);
  });

  test("t は英語なら辞書の訳、日本語ならキーを返し、{name} に値を差し込む", () => {
    setLang("en");
    try {
      expect(t("設定")).toBe(EN["設定"]!);
    } finally {
      setLang("ja");
    }
    expect(t("設定")).toBe("設定");
    expect(t("{n} 個", { n: 3 })).toBe("3 個");
  });

  test("t は渡されていない値の {name} をそのまま残し、辞書に無いキーは英語でもキーを返す", () => {
    expect(t("{a} と {b}", { a: 1 })).toBe("1 と {b}");
    setLang("en");
    try {
      expect(t("辞書に無い文言")).toBe("辞書に無い文言"); // i18n-ok（テストのキー）
    } finally {
      setLang("ja");
    }
  });
});

describe("言語の設定（設定画面。D8）", () => {
  const KEY = "matomezu.lang";
  const saved = localStorage.getItem(KEY);
  const restore = () => { if (saved == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved); };

  test("選んだ言語を覚え、「ブラウザに合わせる」なら覚えを消す。知らない値は auto として読む", () => {
    try {
      setLangSetting("en");
      expect([localStorage.getItem(KEY), langSetting()]).toEqual(["en", "en"]);
      setLangSetting("auto");
      expect([localStorage.getItem(KEY), langSetting()]).toEqual([null, "auto"]);
      localStorage.setItem(KEY, "fr");
      expect(langSetting()).toBe("auto");
    } finally {
      restore();
    }
  });

  test("ブラウザの言語は好みの順に見て、最初に当たった日本語か英語。どれにも当たらなければ英語", () => {
    const desc = Object.getOwnPropertyDescriptor(navigator, "languages");
    const as = (langs: string[]) => { Object.defineProperty(navigator, "languages", { configurable: true, get: () => langs }); return browserLang(); };
    try {
      expect(as(["fr-FR", "ja-JP", "en-US"])).toBe("ja");
      expect(as(["de", "en-GB", "ja"])).toBe("en");
      expect(as(["JA"])).toBe("ja");
      expect(as(["jav", "fr"])).toBe("en"); // ja で始まる別の言語（ジャワ語）は日本語にしない
    } finally {
      if (desc) Object.defineProperty(navigator, "languages", desc);
      else delete (navigator as { languages?: unknown }).languages;
    }
  });

  test("設定の画面で言語を変えずに確定したら、読み直さず、覚えも変えない。変えれば覚えて読み直す（サーバーから開いた画面）", () => {
    const reload = spyOn(location, "reload").mockImplementation(() => {});
    document.body.classList.add("served"); // サーバーから開いた画面は、確かめずに読み直す
    try {
      openSettings();
      const ok = () => document.querySelector<HTMLElement>(".mz-dlg [data-ok]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      ok();
      expect(document.querySelector(".mz-dlg")).toBeNull();
      expect(reload).not.toHaveBeenCalled();
      expect(localStorage.getItem(KEY)).toBe(saved);
      openSettings();
      document.querySelector<HTMLSelectElement>('.mz-dlg [name="lang"]')!.value = "en";
      ok();
      expect(reload).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(KEY)).toBe("en");
    } finally {
      reload.mockRestore();
      document.body.classList.remove("served");
      closeEditDialog();
      restore();
    }
  });
});
