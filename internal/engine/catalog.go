package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
)

// aiIndexKey は、AI の一覧（web/src/engine/engine.ts の aiCatalog）の中の、目次の名前
const aiIndexKey = "index"

// AICatalogIndex は MCP 公開ツールの actions が、引数なしで返す物: 一覧の版 version と、目次 index（作るのは aiCatalog。大きい表は id と題名だけ、小さい表は全文）。
// どの表がどの形かは知らず、JS の側が作った目次をそのまま返す
func (e *Engine) AICatalogIndex() json.RawMessage {
	e.mu.Lock()
	defer e.mu.Unlock()
	fields := e.aiFields()
	return marshalFields(map[string]json.RawMessage{"version": quote(e.aiVersion()), aiIndexKey: fields[aiIndexKey]})
}

// AICatalogEntries は、MCP 公開ツールの actions が ids を受けたとき返す物: 一覧の表ごとに、id が ids にある物の全文（表の名前 → 並び）と、どの表にも無い id（unknown）。
// 表が違えば同じ id があり得るので、表ごとに分けて返す
func (e *Engine) AICatalogEntries(ids []string) json.RawMessage {
	e.mu.Lock()
	defer e.mu.Unlock()
	want := map[string]bool{}
	for _, id := range ids {
		want[id] = true
	}
	found := map[string]bool{}
	out := map[string]json.RawMessage{"version": quote(e.aiVersion())}
	for table, raw := range e.aiFields() {
		var list []json.RawMessage
		if table == aiIndexKey || json.Unmarshal(raw, &list) != nil {
			continue
		}
		picked := []json.RawMessage{}
		for _, entry := range list {
			if id := entryID(entry); want[id] {
				picked = append(picked, entry)
				found[id] = true
			}
		}
		if len(picked) > 0 {
			out[table], _ = json.Marshal(picked)
		}
	}
	unknown := []string{}
	for id := range want {
		if !found[id] {
			unknown = append(unknown, id)
		}
	}
	sort.Strings(unknown)
	if len(unknown) > 0 {
		out["unknown"], _ = json.Marshal(unknown)
	}
	return marshalFields(out)
}

// aiVersion は一覧の版: 一覧の中身から作る印（追加プラグインを足し引きすると変わる。e.mu を持って呼ぶ）
func (e *Engine) aiVersion() string {
	sum := sha256.Sum256(e.aiCatalog)
	return hex.EncodeToString(sum[:])[:12]
}

// aiFields は一覧の最上位の項目（e.mu を持って呼ぶ）
func (e *Engine) aiFields() map[string]json.RawMessage {
	fields := map[string]json.RawMessage{}
	_ = json.Unmarshal(e.aiCatalog, &fields)
	return fields
}

// entryID は表の 1 つの物の id（オブジェクトなら id の項目、文字列ならその文字列）
func entryID(entry json.RawMessage) string {
	var s string
	if json.Unmarshal(entry, &s) == nil {
		return s
	}
	var o struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(entry, &o)
	return o.ID
}

func quote(s string) json.RawMessage {
	out, _ := json.Marshal(s)
	return out
}

func marshalFields(fields map[string]json.RawMessage) json.RawMessage {
	out, _ := json.Marshal(fields)
	return out
}
