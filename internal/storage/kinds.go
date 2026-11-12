package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
)

// kind は、レコードの種類 1 つの置き場所: 種類ごとの表の名前と、索引キーの宣言（i 番目の索引キーは列 k<i> に置く）。
// 表と列の名前は番号から作り、プラグインが決めた id や名前を SQL に入れない
type kind struct {
	table string
	keys  []KeySpec
}

func (k kind) column(name string) (string, string, bool) {
	for i, key := range k.keys {
		if key.Name == name {
			return fmt.Sprintf("k%d", i), key.Type, true
		}
	}
	return "", "", false
}

func columnType(t string) string {
	if t == "number" {
		return "REAL"
	}
	return "TEXT"
}

// loadKinds は、種類の表の一覧を読む（開いたときと、SetKinds のあと）
func (s *sqliteStorage) loadKinds() error {
	rows, err := s.db.Query(`SELECT n, subject, spec FROM kinds`)
	if err != nil {
		return err
	}
	defer rows.Close()
	kinds := map[string]kind{}
	for rows.Next() {
		var n int64
		var subject, spec string
		if err := rows.Scan(&n, &subject, &spec); err != nil {
			return err
		}
		var keys []KeySpec
		if err := json.Unmarshal([]byte(spec), &keys); err != nil {
			return err
		}
		kinds[subject] = kind{fmt.Sprintf("rec_%d", n), keys}
	}
	s.kinds = kinds
	return rows.Err()
}

// createKind は、種類の表 table を作る（索引キーの列と、列ごとの索引も）
func createKind(tx *sql.Tx, table string, keys []KeySpec) error {
	cols := ""
	for i, k := range keys {
		cols += fmt.Sprintf(", k%d %s", i, columnType(k.Type))
	}
	if _, err := tx.Exec(`CREATE TABLE ` + table + ` (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL` + cols + `)`); err != nil {
		return err
	}
	for i := range keys {
		if _, err := tx.Exec(fmt.Sprintf(`CREATE INDEX %s_k%d ON %s (k%d)`, table, i, table, i)); err != nil {
			return err
		}
	}
	return nil
}

func (s *sqliteStorage) SetKinds(specs []KindSpec) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, spec := range specs {
		keys := spec.Keys
		if keys == nil {
			keys = []KeySpec{}
		}
		body, err := json.Marshal(keys)
		if err != nil {
			return err
		}
		have, known := s.kinds[spec.Subject]
		switch {
		case !known:
			// 初めて伝えられた種類: 表を作り、中を解釈せずに置いていたレコードを移す
			res, err := tx.Exec(`INSERT INTO kinds (subject, spec) VALUES (?, ?)`, spec.Subject, string(body))
			if err != nil {
				return err
			}
			n, err := res.LastInsertId()
			if err != nil {
				return err
			}
			table := fmt.Sprintf("rec_%d", n)
			if err := createKind(tx, table, keys); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO `+table+` (id, body, version, updated_at) SELECT id, body, version, updated_at FROM records WHERE subject = ?`, spec.Subject); err != nil {
				return err
			}
			if _, err := tx.Exec(`DELETE FROM records WHERE subject = ?`, spec.Subject); err != nil {
				return err
			}
		case !slices.Equal(have.keys, keys):
			// 索引キーの宣言が変わった種類: 表を作り直し、中身だけを移す（索引キーの値は FillKeys で入れ直す）
			old := have.table + "_old"
			if _, err := tx.Exec(`ALTER TABLE ` + have.table + ` RENAME TO ` + old); err != nil {
				return err
			}
			for i := range have.keys {
				if _, err := tx.Exec(fmt.Sprintf(`DROP INDEX IF EXISTS %s_k%d`, have.table, i)); err != nil {
					return err
				}
			}
			if err := createKind(tx, have.table, keys); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO ` + have.table + ` (id, body, version, updated_at) SELECT id, body, version, updated_at FROM ` + old); err != nil {
				return err
			}
			if _, err := tx.Exec(`DROP TABLE ` + old); err != nil {
				return err
			}
			if _, err := tx.Exec(`UPDATE kinds SET spec = ? WHERE subject = ?`, string(body), spec.Subject); err != nil {
				return err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return s.loadKinds()
}

// keyArgs は、種類 k の索引キーの列に入れる値（宣言の順。値が無い・型が合わないキーは NULL）
func keyArgs(k kind, values map[string]any) []any {
	out := make([]any, len(k.keys))
	for i, key := range k.keys {
		switch v := values[key.Name].(type) {
		case string:
			if key.Type == "text" {
				out[i] = v
			}
		case float64:
			if key.Type == "number" {
				out[i] = v
			}
		case int64:
			if key.Type == "number" {
				out[i] = float64(v)
			}
		case int:
			if key.Type == "number" {
				out[i] = float64(v)
			}
		}
	}
	return out
}

func (s *sqliteStorage) FillKeys(subject string, keys map[string]map[string]any) error {
	k, ok := s.kinds[subject]
	if !ok || len(k.keys) == 0 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	sets := make([]string, len(k.keys))
	for i := range k.keys {
		sets[i] = fmt.Sprintf("k%d = ?", i)
	}
	// 渡されなかったレコードの値は消す（今の宣言で値を返さないレコード）
	if _, err := tx.Exec(`UPDATE `+k.table+` SET `+strings.Join(sets, ", "), make([]any, len(k.keys))...); err != nil {
		return err
	}
	stmt, err := tx.Prepare(`UPDATE ` + k.table + ` SET ` + strings.Join(sets, ", ") + ` WHERE id = ?`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for id, values := range keys {
		if _, err := stmt.Exec(append(keyArgs(k, values), id)...); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *sqliteStorage) Record(subject, id string) (*Record, error) {
	r := Record{Subject: subject, ID: id}
	var body string
	var err error
	if k, ok := s.kinds[subject]; ok {
		err = s.db.QueryRow(`SELECT body, version FROM `+k.table+` WHERE id = ?`, id).Scan(&body, &r.Version)
	} else {
		err = s.db.QueryRow(`SELECT body, version FROM records WHERE subject = ? AND id = ?`, subject, id).Scan(&body, &r.Version)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.Body = json.RawMessage(body)
	return &r, nil
}

func (s *sqliteStorage) Find(subject string, q Query) ([]Found, error) {
	k, ok := s.kinds[subject]
	if !ok {
		// 伝えられたことの無い種類は索引キーを持たない
		if len(q.Where) > 0 || q.Order != nil {
			return nil, ErrUnknownKey
		}
		k = kind{table: "records"}
	}
	cols := "id, version"
	if !q.KeysOnly {
		cols += ", body"
	}
	for i := range k.keys {
		cols += fmt.Sprintf(", k%d", i)
	}
	var where []string
	var args []any
	if !ok {
		where = append(where, "subject = ?")
		args = append(args, subject)
	}
	for _, c := range q.Where {
		col, typ, has := k.column(c.Key)
		if !has {
			return nil, ErrUnknownKey
		}
		switch c.Op {
		case "absent":
			where = append(where, col+" IS NULL")
		case "present":
			where = append(where, col+" IS NOT NULL")
		case "eq", "lt", "gt":
			_, text := c.Value.(string)
			if text != (typ == "text") {
				return nil, ErrUnknownKey
			}
			where = append(where, col+map[string]string{"eq": " = ?", "lt": " < ?", "gt": " > ?"}[c.Op])
			args = append(args, c.Value)
		default:
			return nil, ErrUnknownKey
		}
	}
	query := `SELECT ` + cols + ` FROM ` + k.table
	if len(where) > 0 {
		query += ` WHERE ` + strings.Join(where, " AND ")
	}
	if q.Order != nil {
		col, _, has := k.column(q.Order.Key)
		if !has {
			return nil, ErrUnknownKey
		}
		dir := "ASC"
		if q.Order.Desc {
			dir = "DESC"
		}
		query += ` ORDER BY ` + col + ` IS NULL, ` + col + ` ` + dir + `, id`
	} else {
		query += ` ORDER BY id`
	}
	if q.Limit > 0 {
		query += fmt.Sprintf(` LIMIT %d`, q.Limit)
	}
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Found{}
	for rows.Next() {
		f := Found{Keys: map[string]any{}}
		var body string
		texts := make([]sql.NullString, len(k.keys))
		nums := make([]sql.NullFloat64, len(k.keys))
		dest := []any{&f.ID, &f.Version}
		if !q.KeysOnly {
			dest = append(dest, &body)
		}
		for i, key := range k.keys {
			if key.Type == "number" {
				dest = append(dest, &nums[i])
			} else {
				dest = append(dest, &texts[i])
			}
		}
		if err := rows.Scan(dest...); err != nil {
			return nil, err
		}
		if !q.KeysOnly {
			f.Body = json.RawMessage(body)
		}
		for i, key := range k.keys {
			if key.Type == "number" && nums[i].Valid {
				f.Keys[key.Name] = nums[i].Float64
			} else if key.Type != "number" && texts[i].Valid {
				f.Keys[key.Name] = texts[i].String
			}
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
