package storage

import (
	"bytes"
	"cmp"
	"database/sql"
	"encoding/json"
	"fmt"
	"maps"
	"slices"
)

// trashToFolder は、ゴミ箱をフォルダの役にする:
//   - ゴミ箱の行（library-trash）を作る（空の置き場所でも）
//   - 土台のフィールド trashed（入れた時刻の文字列）を持つブックを、入っていたフォルダの並びから外し、ゴミ箱の並びへ入れる（入れた時刻の古い順。同じ時刻なら id の順）。
//     from は、その時にいたフォルダから書庫ホームまでの id（近い順。たどって書庫ホームに着かなければ、末尾に書庫ホームを足す）。表 entries の folder はゴミ箱にする。
//     ブックの行は trashed のキーだけを外し、ほかのキーの順と値・版・書いた時刻は変えない
//   - 並びを変えた行（ブックの行の trashed を外したのを除く）は、版を 1 上げる。書いた時刻は変えない（ブックの触れた時刻 Touched を動かさない）
func trashToFolder(tx *sql.Tx) error {
	folders, err := folderBodies(tx)
	if err != nil {
		return err
	}
	places := map[string]string{}
	rows, err := tx.Query(`SELECT id, folder FROM entries`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id, folder string
		if err := rows.Scan(&id, &folder); err != nil {
			rows.Close()
			return err
		}
		places[id] = folder
	}
	if err := rows.Close(); err != nil {
		return err
	}
	var trash []json.RawMessage
	_, hadTrash := folders[TrashID]
	if hadTrash {
		if RoleOf(folders[TrashID]) != "trash" {
			return fmt.Errorf("the folder %s is not the trash", TrashID)
		}
		trash = lineupIn(folders[TrashID])
	}
	type trashedBook struct{ id, at string }
	var books []trashedBook
	for _, id := range slices.Sorted(maps.Keys(folders)) {
		if !IsBookRole(RoleOf(folders[id])) {
			continue
		}
		var head struct {
			Trashed string `json:"trashed"`
		}
		if json.Unmarshal(folders[id], &head) == nil && head.Trashed != "" {
			books = append(books, trashedBook{id, head.Trashed})
		}
	}
	slices.SortStableFunc(books, func(a, b trashedBook) int { return cmp.Compare(a.at, b.at) })
	bumped := map[string]bool{} // 並びを変えて、版を上げる行（フォルダの表）
	for _, b := range books {
		from := []string{}
		seen := map[string]bool{b.id: true}
		for at, ok := places[b.id]; ok && !seen[at]; at, ok = places[at] {
			seen[at] = true
			from = append(from, at)
			if at == HomeID {
				break
			}
		}
		if len(from) == 0 || from[len(from)-1] != HomeID {
			from = append(from, HomeID)
		}
		if holder, ok := places[b.id]; ok && IsOpenRole(RoleOf(folders[holder])) {
			kept := slices.DeleteFunc(lineupIn(folders[holder]), func(e json.RawMessage) bool { return refID(e) == b.id })
			body, ok := withField(folders[holder], "lineup", marshal(kept))
			if !ok {
				return fmt.Errorf("the folder %s could not be rewritten", holder)
			}
			folders[holder] = body
			bumped[holder] = true
		}
		trash = append(trash, marshal(trashRef{Kind: "book", ID: b.id, Trashed: b.at, From: from}))
		body, _ := withField(folders[b.id], "trashed", nil)
		if _, err := tx.Exec(`UPDATE folders SET body = ? WHERE id = ?`, string(body), b.id); err != nil {
			return err
		}
		folders[b.id] = body
		if _, err := tx.Exec(`INSERT INTO entries (id, folder) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET folder = excluded.folder`, b.id, TrashID); err != nil {
			return err
		}
	}
	for _, id := range slices.Sorted(maps.Keys(bumped)) {
		if _, err := tx.Exec(`UPDATE folders SET body = ?, version = version + 1 WHERE id = ?`, string(folders[id]), id); err != nil {
			return err
		}
	}
	if hadTrash {
		_, err = tx.Exec(`UPDATE folders SET body = ?, version = version + 1 WHERE id = ?`, string(TrashBody(trash)), TrashID)
	} else {
		_, err = tx.Exec(`INSERT INTO folders (id, body, version, updated_at) VALUES (?, ?, 1, ?)`, TrashID, string(TrashBody(trash)), now())
	}
	return err
}

// folderBodies は、表 folders の全部の行の本文（id → 本文）
func folderBodies(tx *sql.Tx) (map[string]json.RawMessage, error) {
	rows, err := tx.Query(`SELECT id, body FROM folders`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]json.RawMessage{}
	for rows.Next() {
		var id string
		var body []byte
		if err := rows.Scan(&id, &body); err != nil {
			return nil, err
		}
		out[id] = body
	}
	return out, rows.Err()
}

// lineupIn は、フォルダの本文 body の並び（読めなければ空）
func lineupIn(body json.RawMessage) []json.RawMessage {
	var f struct {
		Lineup []json.RawMessage `json:"lineup"`
	}
	_ = json.Unmarshal(body, &f)
	if f.Lineup == nil {
		return []json.RawMessage{}
	}
	return f.Lineup
}

// refID は、並びのエントリ e の id（読めなければ空）
func refID(e json.RawMessage) string {
	var ref struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(e, &ref)
	return ref.ID
}

// jsonString は、文字 s の JSON（< > & を書き替えない）
func jsonString(s string) json.RawMessage {
	var out bytes.Buffer
	enc := json.NewEncoder(&out)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s)
	return bytes.TrimRight(out.Bytes(), "\n")
}

// withField は、JSON のオブジェクト body の、キー key の値を value に替えた物（value が nil ならキーを外す。無いキーは末尾に足す）。
// ほかのキーの順と値は、そのまま残す。オブジェクトとして読めなければ ok が false
func withField(body json.RawMessage, key string, value json.RawMessage) (json.RawMessage, bool) {
	dec := json.NewDecoder(bytes.NewReader(body))
	if t, err := dec.Token(); err != nil || t != json.Delim('{') {
		return body, false
	}
	var out bytes.Buffer
	out.WriteByte('{')
	put := func(k string, v json.RawMessage) {
		if out.Len() > 1 {
			out.WriteByte(',')
		}
		out.Write(jsonString(k))
		out.WriteByte(':')
		out.Write(v)
	}
	found := false
	for dec.More() {
		t, err := dec.Token()
		k, isKey := t.(string)
		if err != nil || !isKey {
			return body, false
		}
		var v json.RawMessage
		if dec.Decode(&v) != nil {
			return body, false
		}
		if k != key {
			put(k, v)
			continue
		}
		found = true
		if value != nil {
			put(k, value)
		}
	}
	if t, err := dec.Token(); err != nil || t != json.Delim('}') {
		return body, false
	}
	if !found && value != nil {
		put(key, value)
	}
	out.WriteByte('}')
	return out.Bytes(), true
}
