/*
 * AI の問いのドロワー（D36。docs/ASK-plan.md）。吹き出しに収まらない問い（本文が長い・ボタンが多い・複数選択・文字の入力）を開く。
 * 図の枠の上に重ねる（図を押しのけない）。横長の画面では右から、縦長の画面では下から出る（CSS）。
 * 選択肢は、複数選択ならチェックボックス、そうでなければラジオ。文字の入力は、選ばなくても答えられる補足（文字だけで答えてもよい）。
 * 文字の入力だけに頼らないよう、いつも「答えない」を付ける（2026-10-16 ユーザー）。選択肢も入力も無い問いは「閉じる」で見たことにする。
 *
 *   const D = createAskDrawer(host, { answer, decline, seen, reveal });
 *   D.open(item, { caption }); D.close(); D.showing();
 */
import { esc, injectStyle } from "./dom";
import { t } from "./i18n";

export interface DrawerItem { id: string; box: string; text?: string; choices?: string[]; multi?: boolean; input?: boolean; letter?: string }

export interface DrawerHandlers {
  answer(id: string, answer: string[], note: string): void;
  decline(id: string): void; // 答えない
  seen(id: string): void;    // 選択肢も入力も無い問いを閉じた
  reveal(box: string): void; // 対象の箱を押した（その箱を見せる）
}

const STYLE_ID = "matomezu-ask-drawer-style";
const CSS = `
.mz-ask-drawer { position: absolute; top: 0; right: 0; bottom: 0; z-index: 30; width: 320px; max-width: 100%; box-sizing: border-box; display: flex; flex-direction: column;
  background: var(--bar, #fff); color: inherit; border-left: 1px solid var(--bar-border, rgba(127,127,127,.3)); box-shadow: -6px 0 20px rgba(0,0,0,.12); font-size: 13px; }
.mz-ask-drawer[hidden] { display: none; }
@media (max-aspect-ratio: 1/1) {
  .mz-ask-drawer { top: auto; left: 0; width: auto; height: min(55%, 420px); border-left: 0; border-top: 1px solid var(--bar-border, rgba(127,127,127,.3)); box-shadow: 0 -6px 20px rgba(0,0,0,.12); }
}
.mz-ask-drawer header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--bar-border, rgba(127,127,127,.3)); font-weight: 600; }
.mz-ask-drawer header span { flex: 1; }
.mz-ask-drawer header button { border: 0; background: transparent; color: inherit; opacity: .6; font-size: 16px; cursor: pointer; }
.mz-ask-drawer .mz-ask-q { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.mz-ask-drawer .mz-ask-about { font-size: 11px; opacity: .75; }
.mz-ask-drawer .mz-ask-about button { font: inherit; border: 0; padding: 0; background: transparent; color: var(--ask); font-weight: 600; cursor: pointer; text-decoration: underline; }
.mz-ask-drawer p { margin: 0; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.mz-ask-drawer fieldset { border: 1px solid var(--bar-border, rgba(127,127,127,.3)); border-radius: 8px; padding: 8px 10px; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.mz-ask-drawer legend { font-size: 11px; opacity: .75; padding: 0 4px; }
.mz-ask-drawer label { display: flex; gap: 6px; align-items: flex-start; }
.mz-ask-drawer textarea { font: inherit; font-size: 12px; width: 100%; box-sizing: border-box; min-height: 64px; border: 1px solid var(--bar-border, rgba(127,127,127,.3)); border-radius: 6px; padding: 6px; background: transparent; color: inherit; resize: vertical; }
.mz-ask-drawer footer { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--bar-border, rgba(127,127,127,.3)); }
.mz-ask-drawer footer button { font: inherit; font-size: 12px; padding: 5px 14px; border-radius: 6px; border: 1px solid var(--ask); background: transparent; color: inherit; cursor: pointer; }
.mz-ask-drawer footer [data-decline] { margin-right: auto; border-color: var(--bar-border, rgba(127,127,127,.3)); opacity: .8; }
.mz-ask-drawer footer [data-ok] { background: var(--ask); color: #fff; }
.mz-ask-drawer footer [data-ok]:disabled { opacity: .45; cursor: default; }
`;

export function createAskDrawer(host: HTMLElement, h: DrawerHandlers) {
  injectStyle(STYLE_ID, CSS);
  const el = document.createElement("aside");
  el.className = "mz-ask-drawer";
  el.hidden = true;
  el.setAttribute("aria-label", t("AI の問い"));
  host.appendChild(el);
  let item: DrawerItem | null = null;

  const close = () => { el.hidden = true; el.innerHTML = ""; item = null; };

  function open(it: DrawerItem, o: { caption: string }) {
    item = it;
    const choices = it.choices ?? [];
    const kind = it.multi ? "checkbox" : "radio";
    const asks = choices.length > 0 || !!it.input;
    el.innerHTML = `<header><span>${esc(t("AI の問い"))}${it.letter ? ` ${esc(it.letter)}` : ""}</span>
        <button type="button" data-close aria-label="${esc(t("閉じる"))}" title="${esc(t("閉じる（あとで答えられます）"))}">×</button></header>
      <div class="mz-ask-q">
        <div class="mz-ask-about">${esc(t("対象の箱"))}: <button type="button" data-reveal>${esc(o.caption)}</button></div>
        ${it.text ? `<p>${esc(it.text)}</p>` : ""}
        ${choices.length ? `<fieldset><legend>${esc(it.multi ? t("当てはまるもの（いくつでも）") : t("1 つ選んでください"))}</legend>
          ${choices.map((c, i) => `<label><input type="${kind}" name="mz-ask-choice" id="mz-ask-c${i}" value="${esc(c)}">${esc(c)}</label>`).join("")}</fieldset>` : ""}
        ${it.input ? `<textarea id="mz-ask-note" placeholder="${esc(choices.length ? t("補足があれば（書かなくても答えられます）") : t("答えを書いてください"))}"></textarea>` : ""}
      </div>
      <footer>${asks
        ? `<button type="button" data-decline>${esc(t("答えない"))}</button><button type="button" data-ok disabled>${esc(t("答える"))}</button>`
        : `<button type="button" data-seen style="margin-left:auto">${esc(t("閉じる"))}</button>`}</footer>`;
    el.hidden = false;
    const ok = el.querySelector<HTMLButtonElement>("[data-ok]");
    const picked = () => [...el.querySelectorAll<HTMLInputElement>('[name="mz-ask-choice"]:checked')].map(x => x.value);
    const note = () => el.querySelector<HTMLTextAreaElement>("#mz-ask-note")?.value.trim() ?? "";
    const update = () => { if (ok) ok.disabled = !picked().length && !note(); };
    el.oninput = update;
    el.onchange = update;
    el.onclick = e => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || !item) return;
      const id = item.id;
      if (target.closest("[data-close]")) close();
      else if (target.closest("[data-reveal]")) h.reveal(item.box);
      else if (target.closest("[data-decline]")) { close(); h.decline(id); }
      else if (target.closest("[data-seen]")) { close(); h.seen(id); }
      else if (target.closest("[data-ok]") && ok && !ok.disabled) { const a = picked(), n = note(); close(); h.answer(id, a, n); }
    };
    // 図のキー操作（Undo・Delete など）に届けない
    el.onkeydown = e => { e.stopPropagation(); if (e.key === "Escape") close(); };
    (el.querySelector<HTMLElement>("input, textarea") ?? el.querySelector<HTMLElement>("footer button"))?.focus();
  }

  return { open, close, showing: () => item?.id ?? null, destroy: () => el.remove() };
}
