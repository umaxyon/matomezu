// 通知（matomezu notify と、matomezu open の「届いています」）のダイアログを出す。届け方は app.ts の deliver（D30。docs/NOTIFY-plan.md）
import { type MailNote, fetchMail, openNoteDialog, readMail, removeMail } from "./mailbox";

// 通知のダイアログの順番待ち（2026-10-15 ユーザー）。ほかのダイアログ（編集ダイアログや前の通知）が開いていれば押しのけず、閉じたら届いた順に出す
// （押しのけると、前の通知や編集中の入力が失われるため）。待っている間は郵便箱に未読の行として残り、その間に郵便箱から中身を見た分は出さない
export interface QueuedNote { note: MailNote; into: string | null; sent: string | null; open: () => void }
export function createNoteQueue() {
  const noteQueue: QueuedNote[] = [];
  let showingNote = false;
  const dialogOpen = () => !!document.querySelector(".mz-dlg-overlay");
  function queueNote(q: QueuedNote) {
    noteQueue.push(q);
    void showNextNote();
  }
  async function showNextNote() {
    if (showingNote || dialogOpen()) return;
    const q = noteQueue.shift();
    if (!q) return;
    showingNote = true;
    try {
      if (q.into && q.sent) {
        const still = (await fetchMail(q.into)).find(m => m.id === q.sent);
        if (!still || still.read) return; // 待っている間に郵便箱から見た・消した
        if (dialogOpen()) { noteQueue.unshift(q); return; } // 確かめている間に別のダイアログが開いた
      }
      const { note, into, sent } = q;
      // ダイアログで中身を見せるので、読んだことにする（説明だけなら取り除く。開く動きがあればキャンセルでも残る）
      if (into && sent) void (note.book ? readMail(into, sent) : removeMail(into, sent));
      openNoteDialog(note, () => {
        q.open();
        if (into && sent) void removeMail(into, sent);
      });
    } finally {
      showingNote = false;
      if (!dialogOpen()) void showNextNote(); // 出さなかった（見た・消した）なら次へ
    }
  }
  // ダイアログが閉じたら、待っている通知を出す（閉じたときの処理がさらにダイアログを開くこともあるので、次の番に回してから見る）
  new MutationObserver(list => {
    if (noteQueue.length && list.some(m => [...m.removedNodes].some(x => x instanceof Element && x.classList.contains("mz-dlg-overlay")))) {
      setTimeout(() => void showNextNote(), 0);
    }
  }).observe(document.body, { childList: true });

  return queueNote;
}
