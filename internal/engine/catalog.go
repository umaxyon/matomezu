package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
)

// aiIndexKey は、AI の一覧（web/src/engine/ai-catalog.ts の aiCatalog）の中の、目次の名前
const aiIndexKey = "index"

// AICatalogIndex は MCP 公開ツールの actions が、引数なしで返す物: 一覧の版 version と、目次 index（作るのは aiCatalog。大きい表は id と題名だけ、小さい表は全文）。
// どの表がどの形かは知らず、JS の側が作った目次をそのまま返す
func (e *Engine) AICatalogIndex() json.RawMessage {
	e.mu.Lock()
	defer e.mu.Unlock()
	fields := e.aiFields()
	return marshalFields(map[string]json.RawMessage{"version": quote(e.aiVersion()), aiIndexKey: fields[aiIndexKey]})
}

// aiActionsTable は、AI の一覧の中の、アクションの表の名前（頭のプラグイン名を付け忘れた名前を、名前の終わりで探す表）
const aiActionsTable = "actions"

// AICatalogEntries は、MCP 公開ツールの actions が ids を受けたとき返す物: 一覧の表ごとに、id が ids にある物の全文（表の名前 → 並び）と、どの表にも無い id（unknown）。
// 表が違えば同じ id があり得るので、表ごとに分けて返す。
// どの表にも無い id がアクションの名前の終わりと一致するときは、1 つに決まるなら全文を返して正しい名前を添え（corrected: 渡した名前 → 正しい名前）、
// 2 つ以上なら選ばず候補の正しい名前だけを返す（ambiguous: 渡した名前 → 正しい名前の並び）
func (e *Engine) AICatalogEntries(ids []string) json.RawMessage {
	e.mu.Lock()
	defer e.mu.Unlock()
	want := map[string]bool{}
	for _, id := range ids {
		want[id] = true
	}
	found := map[string]bool{}
	out := map[string]json.RawMessage{"version": quote(e.aiVersion())}
	tables := map[string][]json.RawMessage{}
	for table, raw := range e.aiFields() {
		var list []json.RawMessage
		if table == aiIndexKey || json.Unmarshal(raw, &list) != nil {
			continue
		}
		tables[table] = list
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
	corrected := map[string]string{}
	ambiguous := map[string][]string{}
	var fixed []json.RawMessage
	for id := range want {
		if found[id] {
			continue
		}
		var hits []json.RawMessage
		var names []string
		for _, entry := range tables[aiActionsTable] {
			if full := entryID(entry); endsWithName(full, id) {
				hits = append(hits, entry)
				names = append(names, full)
			}
		}
		switch len(hits) {
		case 0:
			unknown = append(unknown, id)
		case 1:
			corrected[id] = names[0]
			fixed = append(fixed, hits[0])
		default:
			sort.Strings(names)
			ambiguous[id] = names
		}
	}
	if len(fixed) > 0 {
		var already []json.RawMessage
		_ = json.Unmarshal(out[aiActionsTable], &already)
		out[aiActionsTable], _ = json.Marshal(append(already, fixed...))
		out["corrected"], _ = json.Marshal(corrected)
	}
	if len(ambiguous) > 0 {
		out["ambiguous"], _ = json.Marshal(ambiguous)
	}
	sort.Strings(unknown)
	if len(unknown) > 0 {
		out["unknown"], _ = json.Marshal(unknown)
	}
	return marshalFields(out)
}

// endsWithName は、full（@プラグイン:名前 の形）が、頭を省いた name で終わるか。区切りは : か /（名前の途中で切らない）
func endsWithName(full, name string) bool {
	if name == "" || !strings.HasSuffix(full, name) || len(full) == len(name) {
		return false
	}
	c := full[len(full)-len(name)-1]
	return c == ':' || c == '/'
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
