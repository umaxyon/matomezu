package server

// レコード: 対象の定義（プラグインが足した、アクションの対象の種類）のデータ。常駐は中を解釈せず、種類・id ごとに 1 件ずつ、版つきで置く（形を確かめるのは engine）。
// 1 つのアクションが変えたレコードの全部と、番号を振る種類の、区切りごとの次の番号（counters）は、1 回の書き込み（1 つのトランザクション）で書き、1 つの知らせで窓に送る。
//
//	record {"records": [{"subject", "id", "record"（消したなら "removed"）, "version"（消したなら 0）}], "counters"?: {種類: {区切り: 次の番号}}, "window", "client", "seq"}
//	       1 つのアクションが変えたレコード（Hub.broadcast）。counters はそのアクションが進めた区切りだけ。window は最後にフォーカスされた窓の id（無ければ空）

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// recordEntry は、置いてあるレコード 1 件（body は JSON のまま）と、その版
type recordEntry struct {
	body    json.RawMessage
	version int64
}

// recordPut は、書くレコード 1 件。version は書いた後の版（消すなら 0）
type recordPut struct {
	subject string
	id      string
	body    json.RawMessage
	version int64
	removed bool
}

const removedRecord = `"removed"`

// loadRecords は置き場所のレコードと番号の表を読む（NewHub から）
func (h *Hub) loadRecords() error {
	stored, err := h.store.Records()
	if err != nil {
		return err
	}
	h.recordTables = map[string]map[string]recordEntry{}
	for _, r := range stored {
		if h.recordTables[r.Subject] == nil {
			h.recordTables[r.Subject] = map[string]recordEntry{}
		}
		h.recordTables[r.Subject][r.ID] = recordEntry{r.Body, r.Version}
	}
	counters, err := h.store.Counters()
	if err != nil {
		return err
	}
	h.counters = map[string]map[string]int64{}
	for _, c := range counters {
		if h.counters[c.Subject] == nil {
			h.counters[c.Subject] = map[string]int64{}
		}
		h.counters[c.Subject][c.Scope] = c.Next
	}
	return nil
}

// Records は、GET /api/data に載せるレコード（種類の id → id → レコード）と番号の表（種類の id → 区切り → 次の番号）
func (h *Hub) Records() (map[string]map[string]json.RawMessage, map[string]map[string]int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	records := map[string]map[string]json.RawMessage{}
	for subject, table := range h.recordTables {
		records[subject] = map[string]json.RawMessage{}
		for id, e := range table {
			records[subject][id] = e.body
		}
	}
	counters := map[string]map[string]int64{}
	for subject, table := range h.counters {
		counters[subject] = map[string]int64{}
		for scope, n := range table {
			counters[subject][scope] = n
		}
	}
	return records, counters
}

// recordInputs は、アクションを行う前にエンジンへ渡すレコードと番号の表を in に入れる: 宛先のレコードと、アクションが読むだけの種類の全部、対象の種類の番号の表（h.mu を持って呼ぶ）
func (h *Hub) recordInputs(in *engine.Input, needs engine.RecordNeeds, on *engine.On) {
	if needs.Subject == "" {
		return
	}
	in.Records = map[string]map[string]json.RawMessage{}
	if on != nil && on.Record != "" {
		if e, ok := h.recordTables[needs.Subject][on.Record]; ok {
			in.Records[needs.Subject] = map[string]json.RawMessage{on.Record: e.body}
		}
	}
	for _, subject := range needs.Reads {
		in.Records[subject] = map[string]json.RawMessage{}
		for id, e := range h.recordTables[subject] {
			in.Records[subject][id] = e.body
		}
	}
	in.Counters = map[string]map[string]int64{needs.Subject: h.counters[needs.Subject]}
}

// planRecords は out の変えたレコードの全部と進めた番号を、置き場所に書く形にして plan に足す（何も変えない。h.mu を持って呼ぶ）。
// 同じアクションの中で同じレコードは 2 度来ないので、版は置いてある版から決める
func (h *Hub) planRecords(plan *writePlan, out engine.Output) {
	for _, c := range out.Records {
		base := h.recordTables[c.Subject][c.ID].version
		removed := string(c.Record) == removedRecord
		plan.batch.Records = append(plan.batch.Records, storage.RecordWrite{Subject: c.Subject, ID: c.ID, Body: c.Record, Base: base, Removed: removed, Keys: c.Keys})
		put := recordPut{subject: c.Subject, id: c.ID, body: c.Record, version: base + 1, removed: removed}
		if removed {
			put.version = 0
		}
		plan.records = append(plan.records, put)
	}
	for _, subject := range slices.Sorted(maps.Keys(out.Counters)) {
		scopes := out.Counters[subject]
		for _, scope := range slices.Sorted(maps.Keys(scopes)) {
			plan.batch.Counters = append(plan.batch.Counters, storage.Counter{Subject: subject, Scope: scope, Next: scopes[scope]})
		}
	}
}

// applyRecords は、書き終えたレコードの全部をメモリに当て、変えたレコードだけを確かめ直し、窓に 1 つの知らせで送る（h.mu を持って呼ぶ）
func (h *Hub) applyRecords(plan *writePlan, out engine.Output, p Perform) {
	if len(plan.records) == 0 && len(out.Counters) == 0 {
		return
	}
	if h.recordTables == nil {
		h.recordTables = map[string]map[string]recordEntry{}
	}
	changes := make([]map[string]any, 0, len(plan.records))
	keys := make([]recordKey, 0, len(plan.records))
	for _, put := range plan.records {
		if put.removed {
			delete(h.recordTables[put.subject], put.id)
			if len(h.recordTables[put.subject]) == 0 {
				delete(h.recordTables, put.subject)
			}
		} else {
			if h.recordTables[put.subject] == nil {
				h.recordTables[put.subject] = map[string]recordEntry{}
			}
			h.recordTables[put.subject][put.id] = recordEntry{put.body, put.version}
		}
		keys = append(keys, recordKey{put.subject, put.id})
		changes = append(changes, map[string]any{"subject": put.subject, "id": put.id, "record": json.RawMessage(put.body), "version": put.version})
	}
	for subject, scopes := range out.Counters {
		if h.counters[subject] == nil {
			h.counters[subject] = map[string]int64{}
		}
		maps.Copy(h.counters[subject], scopes)
	}
	if err := h.checkRecordsOf(keys); err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not check the records:", err)
	}
	// 最後にフォーカスされた窓も添える（郵便が届いたなら、その窓がマーキーで知らせる）
	last := ""
	if w := h.window(); w != nil {
		last = w.id
	}
	event := map[string]any{"records": changes, "window": last, "client": p.Client, "seq": p.Seq}
	if len(out.Counters) > 0 {
		event["counters"] = out.Counters
	}
	h.broadcast("record", event)
}

// recordKey はレコード 1 件の見分け（種類の id と、レコードの id）
type recordKey struct {
	subject string
	id      string
}

// checkRecords は全部のレコードを今のプラグインで確かめ、効かないレコードの warning の一覧を作り直す（起動したときと、プラグインが変わったとき。h.mu を持って呼ぶ）
func (h *Hub) checkRecords() error {
	// 置いてある全部と、warning を持っていた全部（消えた物は checkRecordsOf が外す）
	keys := slices.Collect(maps.Keys(h.recordLines))
	for subject, table := range h.recordTables {
		for id := range table {
			if _, ok := h.recordLines[recordKey{subject, id}]; !ok {
				keys = append(keys, recordKey{subject, id})
			}
		}
	}
	return h.checkRecordsOf(keys)
}

// checkRecordsOf は、レコード keys（置いてなければ消えた物）を今のプラグインで確かめ、その warning を一覧で入れ替える。
// 効かないレコードは、種類が無い W024・形が合わない W025（郵便は W022・W023）。新しい warning は常駐のログに書く（h.mu を持って呼ぶ）
func (h *Hub) checkRecordsOf(keys []recordKey) error {
	if h.recordLines == nil {
		h.recordLines = map[recordKey][]string{}
	}
	found := make(map[recordKey][]string, len(keys))
	for _, k := range keys {
		e, ok := h.recordTables[k.subject][k.id]
		if !ok {
			continue
		}
		lines, err := h.engine.CheckRecords(map[string]map[string]json.RawMessage{k.subject: {k.id: e.body}})
		if err != nil {
			return err
		}
		found[k] = lines
	}
	for _, k := range keys {
		before := h.recordLines[k]
		lines := found[k]
		for _, line := range lines {
			if !slices.Contains(before, line) {
				fmt.Fprintln(os.Stderr, "warning:", line)
			}
		}
		if len(lines) == 0 {
			delete(h.recordLines, k)
		} else {
			h.recordLines[k] = lines
		}
	}
	return nil
}

// recordWarningLines は、効かないレコードの warning の 1 行ずつ（種類の id、レコードの id の順。h.mu を持って呼ぶ）
func (h *Hub) recordWarningLines() []string {
	keys := slices.SortedFunc(maps.Keys(h.recordLines), func(a, b recordKey) int {
		if c := compareStrings(a.subject, b.subject); c != 0 {
			return c
		}
		return compareStrings(a.id, b.id)
	})
	out := []string{}
	for _, k := range keys {
		out = append(out, h.recordLines[k]...)
	}
	return out
}

// loadRoles は、常駐が読む種類の役（参加者・ワークルーム・郵便）ごとの、対象の定義の id を引き直す（起動したときと、プラグインが変わったとき。h.mu を持って呼ぶ）
func (h *Hub) loadRoles() error {
	roles, err := h.engine.SubjectRoles()
	if err != nil {
		return err
	}
	h.roles = roles
	return nil
}

// recordsOfRole は、役 role の種類のレコードを id の順に返す（役を名乗る定義が無ければ空。h.mu を持って呼ぶ）
func (h *Hub) recordsOfRole(role string) []json.RawMessage {
	table := h.recordTables[h.roles[role]]
	ids := make([]string, 0, len(table))
	for id := range table {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	out := make([]json.RawMessage, 0, len(ids))
	for _, id := range ids {
		out = append(out, table[id].body)
	}
	return out
}

// runOnceActions は、初めて起動したときに 1 度だけ行うアクション（runsOnceAtStart）のうち、まだ行っていない物を利用者として行い、行えたら記録する
// （利用者があとで消しても作り直さない。行えなければ記録せず、次の起動でまた行う。失敗は起動を止めず、ログに書く）
func (h *Hub) runOnceActions() {
	ids, err := h.engine.RunOnceActions()
	if err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not list the actions to run once:", err)
		return
	}
	done, err := h.store.RanOnce()
	if err != nil {
		fmt.Fprintln(os.Stderr, "could not read which actions ran once:", err)
		return
	}
	for _, id := range ids {
		if done[id] {
			continue
		}
		out, err := h.Perform(Perform{Action: id, Args: json.RawMessage("{}")})
		if err != nil || !out.OK {
			fmt.Fprintln(os.Stderr, "the action", id, "could not run at the first start:", err, out.Reason, out.Detail)
			continue
		}
		if err := h.store.MarkRanOnce(id); err != nil {
			fmt.Fprintln(os.Stderr, "could not record that", id, "ran:", err)
		}
	}
}

// syncKinds は、今のプラグインのレコードの種類と索引キーの宣言を置き場所に伝え、全部のレコードの索引キーの値を入れ直す
// （起動したときと、プラグインが変わったとき。索引キーを返す関数はプラグインの物なので、宣言が同じでも値は変わりうる）
func (h *Hub) syncKinds() error {
	kinds, err := h.engine.Kinds()
	if err != nil {
		return err
	}
	specs := make([]storage.KindSpec, 0, len(kinds))
	for _, k := range kinds {
		keys := make([]storage.KeySpec, 0, len(k.Keys))
		for _, key := range k.Keys {
			keys = append(keys, storage.KeySpec{Name: key.Name, Type: key.Type})
		}
		specs = append(specs, storage.KindSpec{Subject: k.Subject, Keys: keys})
	}
	if err := h.store.SetKinds(specs); err != nil {
		return err
	}
	for _, k := range kinds {
		if len(k.Keys) == 0 {
			continue
		}
		bodies := map[string]json.RawMessage{}
		for id, e := range h.recordTables[k.Subject] {
			bodies[id] = e.body
		}
		keys, err := h.engine.KeysOf(k.Subject, bodies)
		if err != nil {
			return err
		}
		if err := h.store.FillKeys(k.Subject, keys); err != nil {
			return err
		}
	}
	return nil
}

// recordSource は、アクションを行っている間にエンジンがレコードを引く口（engine.Source）。置き場所から引き、条件は索引キーの列で絞る
// （中身を開けずに探す。索引キーだけを読むなら、中身は置き場所からも読まない）。Perform が h.mu を持ったまま呼ぶ
type recordSource struct{ h *Hub }

func (s recordSource) Record(subject, id string) (json.RawMessage, bool) {
	r, err := s.h.store.Record(subject, id)
	if err != nil || r == nil {
		return nil, false
	}
	return r.Body, true
}

// sourceCond は engine.js が渡す条件 1 つ（{key, eq}・{key, lt}・{key, gt}・{key, is}）
type sourceCond struct {
	Key string `json:"key"`
	Eq  any    `json:"eq"`
	Lt  any    `json:"lt"`
	Gt  any    `json:"gt"`
	Is  string `json:"is"`
}

func (s recordSource) Find(subject string, where json.RawMessage, keysOnly bool) map[string]engine.SourceFound {
	out := map[string]engine.SourceFound{}
	var conds []sourceCond
	if err := json.Unmarshal(where, &conds); err != nil {
		return out
	}
	q := storage.Query{KeysOnly: keysOnly}
	for _, c := range conds {
		switch {
		case c.Is != "":
			q.Where = append(q.Where, storage.Cond{Key: c.Key, Op: c.Is})
		case c.Eq != nil:
			q.Where = append(q.Where, storage.Cond{Key: c.Key, Op: "eq", Value: c.Eq})
		case c.Lt != nil:
			q.Where = append(q.Where, storage.Cond{Key: c.Key, Op: "lt", Value: c.Lt})
		case c.Gt != nil:
			q.Where = append(q.Where, storage.Cond{Key: c.Key, Op: "gt", Value: c.Gt})
		}
	}
	found, err := s.h.store.Find(subject, q)
	if err != nil {
		return out
	}
	for _, f := range found {
		out[f.ID] = engine.SourceFound{Record: f.Body, Keys: f.Keys}
	}
	return out
}
