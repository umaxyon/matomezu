// CLI（matomezu validate）が使う入口。ビルドして実行ファイルに埋め込み、Go の JavaScript エンジン（goja）で動かす（internal/validate）。
// 画面と同じ検査（validate.ts）を、そのまま使う。JSON の文字列を受け取り、誤りの文の並びを返す（無ければ空）

import { setLang, t } from "./i18n";
import { assignIds, problems } from "./validate";

// CLI は LLM が読むので英語（docs/I18N-plan.md）
setLang("en");

function diagnose(json: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return [t("JSON として読めません: {error}", { error: (e as Error).message })];
  }
  assignIds(data); // 画面と同じく、id の無い箱には読み込むときに連番を振る
  return problems(data);
}

(globalThis as Record<string, unknown>).matomezuDiagnose = diagnose;
