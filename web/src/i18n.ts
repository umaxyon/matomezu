/*
 * 画面の文言の言語（D8 多言語対応、docs/I18N-plan.md）。日本語と英語。
 * - キーは日本語の文言そのもの。t("元に戻す") は、英語なら辞書（i18n/en.ts）の訳を返し、日本語ならそのまま返す。
 *   差し込む値は {name} で書き、t("{n} 個", { n }) のように渡す。
 * - 言語は、設定画面で選んだ言語（localStorage）> ブラウザの言語 > 英語 の順で決め、読み込んだときに固定する。
 *   切り替えは画面を読み直して反映する（どの部品も、作るときに t を呼べばよい）。
 * - index.html に書いた文言は translateDom で置き換える（文字と title・aria-label・placeholder）。
 * - CLI（matomezu validate、goja）にはブラウザの言語も localStorage も無いので英語になる。
 */

import { EN } from "./i18n/en";

export type Lang = "ja" | "en";
export type LangSetting = Lang | "auto";

const STORE_KEY = "matomezu.lang";

// 設定画面で選んだ言語。選んでいなければ auto（ブラウザに合わせる）
export function langSetting(): LangSetting {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === "ja" || v === "en") return v;
  } catch { /* 覚えられなくても動く */ }
  return "auto";
}

export function setLangSetting(v: LangSetting): void {
  try {
    if (v === "auto") localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, v);
  } catch { /* 同上 */ }
}

// ブラウザの言語を好みの順に見て、最初に当たった言語。どれにも当たらなければ英語
export function browserLang(): Lang {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const langs = nav ? (nav.languages?.length ? nav.languages : [nav.language]) : [];
  for (const l of langs) {
    if (/^ja\b/i.test(l ?? "")) return "ja";
    if (/^en\b/i.test(l ?? "")) return "en";
  }
  return "en";
}

let current: Lang = (() => {
  const s = langSetting();
  return s === "auto" ? browserLang() : s;
})();

export const lang = (): Lang => current;

// テストで言語を固定する
export function setLang(l: Lang): void {
  current = l;
}

export function t(key: string, params?: Record<string, unknown>): string {
  const s = current === "en" ? EN[key] ?? key : key;
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

// root の中の、HTML に書いた文言を今の言語にする（英語のときだけ）
export function translateDom(root: ParentNode): void {
  if (current === "ja") return;
  // script（埋め込みの図のデータ）と style の中は見ない
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n instanceof Element && (n.tagName === "SCRIPT" || n.tagName === "STYLE") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text: string = n.nodeValue ?? "", key = text.trim();
      if (key && EN[key] != null) n.nodeValue = text.replace(key, EN[key]);
    } else if (n instanceof Element) {
      for (const a of ["title", "aria-label", "placeholder"]) {
        const v = n.getAttribute(a);
        if (v && EN[v] != null) n.setAttribute(a, EN[v]);
      }
    }
  }
}
