// サーバーからの問い合わせへの答え（D30・D33。docs/NOTIFY-plan.md・docs/PAPER-plan.md）。この画面がカレントなので頼まれた。
// どちらも前に出さず、ファイルも書き換えない。ユーザーがボタンを押している間（ドラッグなど）は、並べると操作が引っかかるので待つ。
// 長く離さなければ busy と答える（LLM はあとで頼み直す）
import { layoutGeometry, layoutMisfits } from "./offscreen-scene";
import { pageNameOf } from "./pages";
import { misfitText } from "./paper-misfit";
import { type Geometry, details, summarize } from "./report";
import { docBase, fetchRemote } from "./sync";
import type { Diagram } from "./types";

// 要約を頼まれたとき、ユーザーがボタンを離すのを待つ長さ（これを過ぎたら busy と答える。サーバーの待ち時間 summaryWait より短く。D30）
const SUMMARY_BUSY = 5000;

export interface AnswersContext {
  canvas: HTMLElement; // 図の枠（見えない所で並べるときの大きさ）
  focus(doc: string): string; // その図の箱を示したフォーカス枠の様子（D37。app-point.ts。無ければ ""）
  // doc のページ page を版 version で表示していれば、その配置の結果（していなければ null で、見えない所で並べる）
  shown(doc: string, page: string, version: string): Geometry | null;
  // matomezu open で、紙に収まらないので届けなかった（マスターを出して reason を知らせる。name はファイルの名前。docs/PAPER-plan.md の 4.6 の 7）
  refuseOpen(doc: string, reason: string, name: string): void;
  // doc の保存待ちの変更を保存し終えるまで待つ（開いていなければすぐ返る。set の確かめの前。H5）
  flush(doc: string): Promise<void>;
}

export function createAnswers(ctx: AnswersContext) {
  // ユーザーがボタンを押しているか（要約のために裏で並べるのを待つ。D30）
  let pressing = false;
  window.addEventListener("pointerdown", () => { pressing = true; }, true);
  for (const type of ["pointerup", "pointercancel"]) window.addEventListener(type, () => { pressing = false; }, true);
  window.addEventListener("blur", () => { pressing = false; }); // 押したままほかのウィンドウへ移ったときに残らないように

  // ボタンを離すまで待つ。SUMMARY_BUSY を過ぎても押していれば false（busy と答える）
  async function released(): Promise<boolean> {
    const until = Date.now() + SUMMARY_BUSY;
    while (pressing) {
      if (Date.now() > until) return false;
      await new Promise(r => setTimeout(r, 100));
    }
    return true;
  }
  // 答えを url へ送る
  const poster = (url: string) => (body: object) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  // 見えない所で並べるときの大きさ（図の枠と同じ。測れなければ 1200×800）
  function offscreenSize() {
    const rect = ctx.canvas.getBoundingClientRect();
    return { w: Math.floor(rect.width) || 1200, h: Math.floor(rect.height) || 800 };
  }

  // matomezu check の配置の要約（D30。docs/NOTIFY-plan.md）。この画面がカレントなので頼まれた。前に出さず、ファイルも書き換えない。
  // そのページをその版で表示していれば表示中の図から、していなければ見えない所に同じ大きさで並べて作る（offscreen-scene.ts）。
  // ユーザーがボタンを押している間（ドラッグなど）は、並べると操作が引っかかるので待つ。長く離さなければ busy と答える（LLM はあとで頼み直す）
  async function answerSummary(req: string, doc: string, page: string, version: string) {
    const send = poster(`api/summary/${encodeURIComponent(req)}`);
    if (!await released()) return send({ busy: true });
    try {
      let g: Geometry | null = ctx.shown(doc, page, version);
      let shown = version;
      if (!g) {
        const r = await fetchRemote(docBase(doc));
        if (!r) return send({ error: "the diagram could not be read" });
        if (r.data instanceof Error) return send({ error: r.data.message });
        g = await layoutGeometry(r.data as Diagram, page || null, offscreenSize());
        shown = r.version.replace(/^W\//, "").replace(/"/g, "");
      }
      return send({ version: shown, page, summary: summarize(g), details: details(g), outside: g.outside ?? [], focus: ctx.focus(doc) });
    } catch (err) {
      return send({ error: err instanceof Error ? err.message : String(err) });
    }
  }
  // matomezu set の前の確かめと、matomezu open の判定（D33。docs/PAPER-plan.md の 4.6 の 7）: 中身（サーバーに預けたもの）を開いたときと同じに
  // 見えない所で並べ、紙の外の箱を形を変えずに押し込んでも紙に収まらないページを答える。open なら、収まらなければこの画面にマスターを出して知らせる
  // （そのブックは届けない）。ボタンを押している間は待つ（answerSummary と同じ）
  async function answerFit(req: string, doc: string, open: boolean, name = "") {
    const url = `api/fit/${encodeURIComponent(req)}`;
    const send = poster(url);
    if (!await released()) return send({ busy: true });
    try {
      // ボタンを離した直後の変更（ドラッグなど）を先に保存する。set は答えのあとにファイルを読み直して書き換えを当て直すので、消えない（H5）
      if (!open) await ctx.flush(doc);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return send({ error: `${res.status}` });
      const next = await res.json() as Diagram;
      const misfits = await layoutMisfits(next, offscreenSize());
      const pageName = (p: string | null) => pageNameOf(next, p);
      if (open && misfits.length) ctx.refuseOpen(doc, misfitText(misfits, pageName), name || doc);
      return send({ over: misfits.map(m => ({ page: m.page ?? "", name: pageName(m.page), paper: m.paper, axis: m.axis, short: Math.ceil(m.short), boxes: m.boxes })) });
    } catch (err) {
      return send({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { summary: answerSummary, fit: answerFit };
}
