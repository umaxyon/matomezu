// サーバーからの問い合わせへの答え（D30・D33。docs/NOTIFY-plan.md・docs/PAPER-plan.md）。この画面がカレントなので頼まれた。
// どちらも前に出さず、ファイルも書き換えない。ユーザーがボタンを押している間（ドラッグなど）は、並べると操作が引っかかるので待つ。
// 長く離さなければ busy と答える（LLM はあとで頼み直す）
import { layoutGeometry } from "./offscreen-scene";
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
  // matomezu set の前の確かめ（D33。docs/PAPER-plan.md）: 書き換えたあとの中身（サーバーに預けたもの）が紙に収まるか。
  // 今のファイルと預けた中身を、ページごとに見えない所で並べて比べ、書き換えで新しく紙からはみ出す最上位の箱を答える
  // （前から紙の外にある箱は数えない。ユーザーの操作の決まりと同じ）。ボタンを押している間は待つ（answerSummary と同じ）
  async function answerFit(req: string, doc: string) {
    const url = `api/fit/${encodeURIComponent(req)}`;
    const send = poster(url);
    if (!await released()) return send({ busy: true });
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return send({ error: `${res.status}` });
      const next = await res.json() as Diagram;
      const now = await fetchRemote(docBase(doc));
      const before = now && !(now.data instanceof Error) ? now.data as Diagram : null;
      const size = offscreenSize();
      const pageIds = (d: Diagram | null) => (d ? ["", ...(Array.isArray(d.pages) ? d.pages.map(p => String(p.id)) : [])] : []);
      const over = [];
      for (const page of pageIds(next)) {
        const g = await layoutGeometry(next, page || null, size);
        if (!g.paper || !g.outside?.length) continue;
        const was = before && pageIds(before).includes(page) ? new Set((await layoutGeometry(before, page || null, size)).outside ?? []) : new Set<string>();
        const fresh = g.outside.filter(id => !was.has(id));
        if (!fresh.length) continue;
        const p = g.paper;
        over.push({
          page, paper: `${p.name} ${p.w}x${p.h}`,
          boxes: fresh.map(id => {
            const b = g.boxes.find(x => x.id === id)!;
            return { id, caption: b.caption, right: Math.max(0, Math.round(b.x + b.w - p.w)), bottom: Math.max(0, Math.round(b.y + b.h - p.h)) };
          }),
        });
      }
      return send({ over });
    } catch (err) {
      return send({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { summary: answerSummary, fit: answerFit };
}
