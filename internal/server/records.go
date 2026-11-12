package server

// レコード: 対象の定義（プラグインが足した、アクションの対象の種類）のデータ。常駐は中を解釈せず、種類・id ごとに 1 件ずつ、版つきで置く（形を確かめるのは engine）。
// 番号を振る種類の、区切りごとの次の番号（counters）は、レコードを書くのと同じ 1 回の書き込みで進める。
//
//	record {"subject", "id", "record"（消したなら "removed"）, "version", "counters"?, "client", "seq"} レコードが変わった（Hub.broadcast）

import (
	"encoding/json"
	"fmt"
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

// planRecord は out の変えたレコードを、置き場所に書く形にして plan に足す（何も変えない。h.mu を持って呼ぶ）
func (h *Hub) planRecord(plan *writePlan, out engine.Output) {
	c := out.Record
	if c == nil {
		return
	}
	base := h.recordTables[c.Subject][c.ID].version
	removed := string(c.Record) == removedRecord
	plan.batch.Records = append(plan.batch.Records, storage.RecordWrite{Subject: c.Subject, ID: c.ID, Body: c.Record, Base: base, Removed: removed})
	put := recordPut{subject: c.Subject, id: c.ID, body: c.Record, version: base + 1, removed: removed}
	if removed {
		put.version = 0
	}
	plan.record = &put
	scopes := make([]string, 0, len(c.Counters))
	for scope := range c.Counters {
		scopes = append(scopes, scope)
	}
	slices.Sort(scopes)
	for _, scope := range scopes {
		plan.batch.Counters = append(plan.batch.Counters, storage.Counter{Subject: c.Subject, Scope: scope, Next: c.Counters[scope]})
	}
}

// applyRecord は、書き終えたレコードをメモリに当て、窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) applyRecord(plan *writePlan, out engine.Output, p Perform) {
	put := plan.record
	if put == nil {
		return
	}
	if h.recordTables == nil {
		h.recordTables = map[string]map[string]recordEntry{}
	}
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
	if len(out.Record.Counters) > 0 {
		if h.counters[put.subject] == nil {
			h.counters[put.subject] = map[string]int64{}
		}
		for scope, n := range out.Record.Counters {
			h.counters[put.subject][scope] = n
		}
	}
	if err := h.checkRecords(); err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not check the records:", err)
	}
	h.broadcast("record", map[string]any{"subject": put.subject, "id": put.id, "record": json.RawMessage(put.body), "version": put.version, "counters": out.Record.Counters, "client": p.Client, "seq": p.Seq})
}

// checkRecords は全部のレコードを今のプラグインで確かめ、効かないレコード（種類が無い・形が合わない）の warning の一覧を直す。新しい warning は常駐のログに書く（h.mu を持って呼ぶ）
func (h *Hub) checkRecords() error {
	all := map[string]map[string]json.RawMessage{}
	for subject, table := range h.recordTables {
		all[subject] = map[string]json.RawMessage{}
		for id, e := range table {
			all[subject][id] = e.body
		}
	}
	lines, err := h.engine.CheckRecords(all)
	if err != nil {
		return err
	}
	for _, line := range lines {
		if !slices.Contains(h.recordLines, line) {
			fmt.Fprintln(os.Stderr, "warning:", line)
		}
	}
	h.recordLines = lines
	return nil
}
