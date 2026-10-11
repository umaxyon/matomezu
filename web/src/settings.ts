/*
 * 全体の設定（ヘッダーの右端の歯車から開く。図ごとではなく、このブラウザでの matomezu の設定）。今は言語だけ（D8、docs/I18N-plan.md）。
 * 言語は「ブラウザに合わせる」が既定。選んだ言語は localStorage に覚え、確定すると画面を読み直して反映する。
 * サーバーから開いていない画面（ファイルを開いただけ）は読み直すと変更を失うので、先に確かめる。
 *
 *   setupSettings(button);
 */

import { openConfirmDialog, openDialog } from "./edit-dialog";
import { type LangSetting, langSetting, setLangSetting, t } from "./i18n";

const LANG_OPTIONS: [LangSetting, string][] = [
  ["auto", t("ブラウザに合わせる")],
  ["ja", "日本語"], // i18n-ok（言語の名前は、その言語で書く）
  ["en", "English"],
];

export function setupSettings(button: HTMLElement): void {
  button.addEventListener("click", openSettings);
}

export function openSettings(): void {
  const now = langSetting();
  openDialog(t("設定"), t("確定"), `
    <label class="mz-dlg-row"><span>${t("言語")}</span>
      <select class="mz-dlg-input" name="lang">${LANG_OPTIONS.map(([v, label]) =>
        `<option value="${v}"${v === now ? " selected" : ""}>${label}</option>`).join("")}</select></label>
    <p class="mz-dlg-note">${t("言語を変えると、画面を読み直します")}</p>`,
  overlay => {
    const v = overlay.querySelector<HTMLSelectElement>('[name="lang"]')!.value as LangSetting;
    if (v === now) return;
    const apply = () => { setLangSetting(v); location.reload(); };
    if (document.body.classList.contains("served")) apply();
    else openConfirmDialog(t("言語の切り替え"), t("画面を読み直すので、保存していない変更は失われます"), t("読み直す"), apply);
  });
}
