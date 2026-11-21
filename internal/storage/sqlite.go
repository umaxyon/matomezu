package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite" // C を使わない SQLite（OS ごとの実行ファイルを 1 台から作れる）
)

// migrations は表の形の移り変わり。i 番目を行うと、表の形の版（PRAGMA user_version）が i+1 になる。足すのは末尾だけ
var migrations = []string{
	`CREATE TABLE books (
		id TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		version INTEGER NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE TABLE settings (
		user TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// ブックを開いた時刻（ブックの id ごと。ブックのデータとは別に持ち、ブックの版は進めない）
	`CREATE TABLE opened (
		id TEXT PRIMARY KEY,
		at TEXT NOT NULL
	);`,
	// ゴミ箱に入れた時刻（NULL ならふつうのブック）
	`ALTER TABLE books ADD COLUMN trashed_at TEXT;`,
	// ゴミ箱に入れた時刻は、ブックのデータ（土台のフィールド trashed）に移す
	`UPDATE books SET body = json_set(body, '$.trashed', trashed_at) WHERE trashed_at IS NOT NULL;
	ALTER TABLE books DROP COLUMN trashed_at;`,
	// ブックごとのアノテーションの並び（ブックのデータとは別に持ち、ブックの版は進めない）
	`CREATE TABLE annotations (
		book TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// 利用者ごとの郵便箱（郵便の並び。届いた順）
	`CREATE TABLE mailbox (
		user TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// ブックごとの、AI 編集チケットの並び（まだ見られていない物と、見られる前に消えた物。ブックのデータとは別に持ち、ブックの版は進めない）
	`CREATE TABLE ai_edit_tickets (
		book TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// 利用者ごとの参加者の表（参加者の並び。要求が届いた順）
	`CREATE TABLE participants (
		user TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// 利用者ごとの、常駐だけが持つ参加者の記録（参加者の id ごとのセッション id と、参加を伝えたかの印）
	`CREATE TABLE participant_notes (
		user TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// id が master の行を消す
	`DELETE FROM books WHERE id = 'master';
	DELETE FROM opened WHERE id = 'master';
	DELETE FROM annotations WHERE book = 'master';
	DELETE FROM ai_edit_tickets WHERE book = 'master';`,
	// ブックは土台のフィールド project、郵便は project、参加者は projects を持つ。project の無いブック・郵便・参加者は標準のプロジェクト default にする
	`UPDATE books SET body = json_set(body, '$.project', 'default') WHERE json_type(body, '$.project') IS NULL;
	UPDATE mailbox SET body = (SELECT json_group_array(json(CASE WHEN json_type(value, '$.project') IS NULL THEN json_set(value, '$.project', 'default') ELSE value END)) FROM json_each(mailbox.body));
	UPDATE participants SET body = (SELECT json_group_array(json(CASE WHEN json_type(value, '$.projects') IS NULL THEN json_set(value, '$.projects', json('["default"]')) ELSE value END)) FROM json_each(participants.body));`,
	// ワークルームの名前は 20 字まで。それより長い名前（参加者のワークルーム、参加の頼みの郵便の希望）は 20 字に切り詰める
	`UPDATE participants SET body = (SELECT json_group_array(json(CASE WHEN length(json_extract(value, '$.workroom')) > 20 THEN json_set(value, '$.workroom', trim(substr(json_extract(value, '$.workroom'), 1, 20))) ELSE value END)) FROM json_each(participants.body));
	UPDATE mailbox SET body = (SELECT json_group_array(json(CASE WHEN json_extract(value, '$.mail') = '@matomezu/base:join-request' AND length(json_extract(value, '$.props.workroom')) > 20 THEN json_set(value, '$.props.workroom', trim(substr(json_extract(value, '$.props.workroom'), 1, 20))) ELSE value END)) FROM json_each(mailbox.body));`,
	// ブック・郵便・参加者はプロジェクトを持たない。ブックと郵便の project、参加者の projects、参加の要求の郵便（join-request）の props の projects を外す
	`UPDATE books SET body = json_remove(body, '$.project');
	UPDATE mailbox SET body = (SELECT json_group_array(json(CASE WHEN json_extract(value, '$.mail') = '@matomezu/base:join-request' THEN json_remove(json_remove(value, '$.project'), '$.props.projects') ELSE json_remove(value, '$.project') END)) FROM json_each(mailbox.body));
	UPDATE participants SET body = (SELECT json_group_array(json(json_remove(value, '$.projects'))) FROM json_each(participants.body));`,
	// 対象の定義が足した種類のレコード（種類・id ごとに 1 行で、版つき）と、番号を振る種類の、区切りごとの次の番号
	`CREATE TABLE records (
		subject TEXT NOT NULL,
		id TEXT NOT NULL,
		body TEXT NOT NULL,
		version INTEGER NOT NULL,
		updated_at TEXT NOT NULL,
		PRIMARY KEY (subject, id)
	);
	CREATE TABLE counters (
		subject TEXT NOT NULL,
		scope TEXT NOT NULL,
		next INTEGER NOT NULL,
		PRIMARY KEY (subject, scope)
	);`,
	// 参加者の表をやめ、参加者・ワークルーム・管理者の印をレコードにする（対象の定義。種類の id は @matomezu/base:participant・workroom・admin-mark）。
	// 受け入れ済みの参加者ごとに、ワークルーム（id は元の参加者の id。名前・鳥・配色は元の workroom・bird・palette）と、そこに入る参加者を作る。
	// 要求中は部屋を持たず、望んだ名前（wantedName）に移す。参加者の表は捨てる
	`INSERT INTO records (subject, id, body, version, updated_at)
	SELECT '@matomezu/base:workroom', json_extract(j.value, '$.id'),
		json_remove(json_object('id', json_extract(j.value, '$.id'), 'name', json_extract(j.value, '$.workroom'), 'bird', json_extract(j.value, '$.bird'),
			'palette', json_extract(j.value, '$.palette'), 'createdAt', COALESCE(json_extract(j.value, '$.joinedAt'), json_extract(j.value, '$.requestedAt'))),
			CASE WHEN json_extract(j.value, '$.palette') IS NULL THEN '$.palette' ELSE '$.none' END), 1, p.updated_at
	FROM participants p, json_each(p.body) j
	WHERE json_extract(j.value, '$.state') = 'joined' AND json_extract(j.value, '$.workroom') IS NOT NULL;
	INSERT INTO records (subject, id, body, version, updated_at)
	SELECT '@matomezu/base:participant', json_extract(j.value, '$.id'),
		CASE WHEN json_extract(j.value, '$.state') = 'joined' AND json_extract(j.value, '$.workroom') IS NOT NULL
			THEN json_object('id', json_extract(j.value, '$.id'), 'state', 'joined', 'ai', json_extract(j.value, '$.ai'), 'model', json_extract(j.value, '$.model'),
				'env', json_extract(j.value, '$.env'), 'sessionName', json_extract(j.value, '$.sessionName'), 'link', json_extract(j.value, '$.link'),
				'workroom', json_extract(j.value, '$.id'), 'requestedAt', json_extract(j.value, '$.requestedAt'),
				'joinedAt', COALESCE(json_extract(j.value, '$.joinedAt'), json_extract(j.value, '$.requestedAt')))
			ELSE json_remove(json_object('id', json_extract(j.value, '$.id'), 'state', 'requested', 'ai', json_extract(j.value, '$.ai'), 'model', json_extract(j.value, '$.model'),
				'env', json_extract(j.value, '$.env'), 'sessionName', json_extract(j.value, '$.sessionName'), 'link', json_extract(j.value, '$.link'),
				'wantedName', json_extract(j.value, '$.workroom'), 'requestedAt', json_extract(j.value, '$.requestedAt')),
				CASE WHEN json_extract(j.value, '$.workroom') IS NULL THEN '$.wantedName' ELSE '$.none' END) END, 1, p.updated_at
	FROM participants p, json_each(p.body) j;
	DROP TABLE participants;`,
	// 利用者の設定「段落の中の改行」の保存した値は、設定の項目の id を @matomezu/markdown:soft-break から @matomezu/base:soft-break に付け替える
	`UPDATE settings SET body = json_remove(json_set(body, '$."@matomezu/base:soft-break"', json_extract(body, '$."@matomezu/markdown:soft-break"')), '$."@matomezu/markdown:soft-break"')
	WHERE json_type(body, '$."@matomezu/markdown:soft-break"') IS NOT NULL;`,
	// 初めて起動したときに 1 度だけ行うアクション（runsOnceAtStart）の、行ったという記録
	`CREATE TABLE ran_once (action TEXT PRIMARY KEY);`,
	// 郵便箱の表をやめ、郵便を 1 通ずつレコードにする（対象の定義。種類の id は @matomezu/base:mail）。読むのは利用者 me の行だけ。
	// 届いた順 order は郵便箱の並びの位置の順に 1 から（id の無い郵便とオブジェクトでない物は飛ばし、その番号は空ける。同じ id は先の物を残す）。
	// 番号の表は、区切り mail の次の番号を、いちばん大きい order の次にする（郵便が無ければ書かない）。郵便箱の表は捨てる
	`INSERT OR IGNORE INTO records (subject, id, body, version, updated_at)
	SELECT '@matomezu/base:mail', json_extract(j.value, '$.id'), json_set(j.value, '$.order', j.key + 1), 1, m.updated_at
	FROM mailbox m, json_each(CASE WHEN json_valid(m.body) AND json_type(m.body) = 'array' THEN m.body ELSE '[]' END) j
	WHERE m.user = 'me' AND j.type = 'object' AND json_type(j.value, '$.id') = 'text' AND json_extract(j.value, '$.id') != ''
	ORDER BY j.key;
	INSERT OR REPLACE INTO counters (subject, scope, next)
	SELECT '@matomezu/base:mail', 'mail', MAX(json_extract(body, '$.order')) + 1 FROM records WHERE subject = '@matomezu/base:mail' HAVING COUNT(*) > 0;
	DROP TABLE mailbox;`,
	// key で見分ける AI 編集チケット（変更提案郵便が開いた物）のうち、失敗にも消えたことにもしておらず、同じ id の郵便のレコード（@matomezu/base:mail）が
	// もう無い物は、閉じる者がいないので閉じる（AI には渡さない）。ほかの AI 編集チケットは並びの順のまま残し、1 つも残らないブックの行は消す
	`UPDATE ai_edit_tickets SET body = (
		SELECT json_group_array(json(value)) FROM (
			SELECT j.value FROM json_each(ai_edit_tickets.body) j
			WHERE NOT (j.type = 'object' AND json_type(j.value, '$.key') IS 'text' AND json_extract(j.value, '$.key') != ''
				AND COALESCE(json_extract(j.value, '$.failed'), 0) = 0
				AND COALESCE(json_extract(j.value, '$.removed'), '') = ''
				AND NOT EXISTS (SELECT 1 FROM records r WHERE r.subject = '@matomezu/base:mail' AND r.id = json_extract(j.value, '$.key')))
			ORDER BY j.key))
	WHERE json_valid(body) AND json_type(body) = 'array';
	DELETE FROM ai_edit_tickets WHERE json_valid(body) AND json_type(body) = 'array' AND json_array_length(body) = 0;`,
	// 種類ごとの表の一覧（n 番目の種類のレコードは表 rec_<n> に置く。spec は索引キーの宣言の並び）。伝えられたことの無い種類のレコードは records に置いたまま
	`CREATE TABLE kinds (
		n INTEGER PRIMARY KEY AUTOINCREMENT,
		subject TEXT NOT NULL UNIQUE,
		spec TEXT NOT NULL
	);`,
	// 言葉で探すための文字（種類と参照先ごとに 1 行。参照先はレコードの id に限らない）。文字は FTS5 の表に、同じ rowid で置く（trigram: 3 字以上の部分一致）
	`CREATE TABLE search_docs (
		rowid INTEGER PRIMARY KEY,
		kind TEXT NOT NULL,
		ref TEXT NOT NULL,
		UNIQUE (kind, ref)
	);
	CREATE VIRTUAL TABLE search_fts USING fts5(title, body, tokenize = 'trigram');`,
	// アノテーションをページごとに持つ（表 page_annotations。ページの id ごとの並び）。ブックごとの並びは、Go の移し替え（goMigrations。migrate_annotations.go）がページへ振り分けてから捨てる
	`CREATE TABLE page_annotations (
		page TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// 変更提案郵便が持つ、当たる物の送った時の値を、物のある所（ページかブック）ごとの表に直す（Go の移し替え。migrate_proposals.go）
	`SELECT 1;`,
	// ブックを、ページとフォルダに分けて持つ（表 pages・folders。フォルダは、エントリの id を順に持つ）。エントリの入っているフォルダは表 entries にも持ち、
	// エントリの id を主キーにして「エントリは、ちょうど 1 つのフォルダに入る」を守る。ブックの表は、Go の移し替え（migrate_books.go）が分けてから捨てる
	`CREATE TABLE pages (
		id TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		version INTEGER NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE TABLE folders (
		id TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		version INTEGER NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE TABLE entries (
		id TEXT PRIMARY KEY,
		folder TEXT NOT NULL
	);
	CREATE INDEX entries_folder ON entries (folder);`,
	// AI 編集チケットを、ブックごとの並びから、全部で 1 つの並びにする（1 回のアクションに 1 つで、変えたページとフォルダを持つため。Go の移し替え。migrate_tickets.go）
	`SELECT 1;`,
	// 書庫ホーム（フォルダの行 library-home）を作り、どのフォルダにも入っていないブックを、書庫ホームの中のフォルダ「旧ブック」に入れる（Go の移し替え。library.go）
	`SELECT 1;`,
	// ゴミ箱を、ブックの土台のフィールド trashed から、フォルダの役 trash の行（library-trash）にする（Go の移し替え。migrate_trash.go）
	`SELECT 1;`,
	// 書庫ホームとフォルダの直下で名前が重なるエントリの、並びの後ろに在る方の名前に番号を足す（Go の移し替え。migrate_titles.go）
	`SELECT 1;`,
	// ワークルームのチケットを記録していた古い種類を捨てる（Go の移し替え。migrate_current_ticket.go）
	`SELECT 1;`,
	// チケットに規模（volume）を、プロジェクトの cardShows に volume を足す（Go の移し替え。migrate_ticket_volume.go）
	`SELECT 1;`,
	// 読めない物のフォルダ（フォルダの行 library-unreadable）を作る（Go の移し替え。migrate_unreadable.go）
	`SELECT 1;`,
	// AI 編集チケットの、見られる前に消えた分（lost。ブックごとに束ねた、どの行かを名指さない形）を捨てる（ステージエントリごとに束ね、消えた所ごとに行を名指す形にしたため）。
	// AI に渡した印も外し、まだ見られていない物も残らない物は消す。Key で見分ける物はそのまま
	`UPDATE ai_edit_tickets SET body = (
		SELECT json_group_array(json(v)) FROM (
			SELECT CASE WHEN json_type(j.value, '$.lost') IS NULL THEN j.value ELSE json_remove(j.value, '$.lost', '$.told') END AS v
			FROM json_each(ai_edit_tickets.body) j
			WHERE json_type(j.value, '$.lost') IS NULL OR COALESCE(json_array_length(j.value, '$.unseen'), 0) > 0
			ORDER BY j.key))
	WHERE json_valid(body) AND json_type(body) = 'array';
	DELETE FROM ai_edit_tickets WHERE json_valid(body) AND json_type(body) = 'array' AND json_array_length(body) = 0;`,
	// 名前を変えた id（プラグイン slide-book は slide-page、ディレクトリ構成図の中身 entry は node）を、本文の中の値で変える（Go の移し替え。migrate_renamed_ids.go）
	`SELECT 1;`,
	// 参加の要求の郵便（種類 join-request）を消す（要求は郵便にせず、要求中の参加者をしおりに出すため。Go の移し替え。migrate_join_request_mail.go）
	`SELECT 1;`,
	// カレントワークのレコードの無いワークルームに、それまで画面がカレントチケットとして先頭に見せていたチケットを書く（Go の移し替え。migrate_current_work.go）
	`SELECT 1;`,
	// 要求中の参加者が持つ orcaWorkspace を adeWorkspace（ADE のワークスペース）に名前を替える（Go の移し替え。migrate_participant_ade.go）
	`SELECT 1;`,
}

// goMigrations は、SQL だけでは書けない移し替え（JSON の中をたどる物）。鍵は migrations の番号（0 から）で、その SQL を行ったあと、同じトランザクションの中で行う
var goMigrations = map[int]func(tx *sql.Tx) error{
	21: annotationsToPages,
	22: proposalSnapshotsToPlaces,
	23: booksToTables,
	24: ticketsToOneList,
	25: placeBooksInLibrary,
	26: trashToFolder,
	27: numberSameTitlesLogged,
	28: dropCurrentTickets,
	29: addTicketVolume,
	30: addUnreadableFolder,
	32: renameIDs,
	33: dropJoinRequestMail,
	34: fillCurrentWorks,
	35: participantAdeWorkspaces,
}

type sqliteStorage struct {
	db    *sql.DB
	kinds map[string]kind // 種類の id → その種類の表（kinds.go）
}

// OpenSQLite は path の SQLite を開き（無ければ作り）、表の形を最新にする
func OpenSQLite(path string) (Storage, error) {
	// 道筋はそのまま渡す（file: の URI にすると、Windows の \ の道筋の読み方が変わる）
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // 書くのは常駐 1 つ。つなぎを 1 本にして、書く順を 1 列にする
	db.SetConnMaxIdleTime(0)
	for _, p := range []string{`PRAGMA busy_timeout = 5000`, `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`} {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return nil, err
		}
	}
	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}
	s := &sqliteStorage{db: db}
	if err := s.loadKinds(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func migrate(db *sql.DB) error {
	var have int
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&have); err != nil {
		return err
	}
	if have > len(migrations) {
		return fmt.Errorf("the data was written by a newer matomezu (form %d, this one knows %d)", have, len(migrations))
	}
	for i := have; i < len(migrations); i++ {
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return err
		}
		if run := goMigrations[i]; run != nil {
			if err := run(tx); err != nil {
				tx.Rollback()
				return err
			}
		}
		if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, i+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// Stamp は時刻を、桁の決まった RFC 3339 の UTC にする（ミリ秒まで。文字のまま比べても新しい順になり、画面の toISOString と同じ形）
func Stamp(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

func now() string { return Stamp(time.Now()) }

func (s *sqliteStorage) Touched() (map[string]string, error) {
	// ブックごとの、フォルダを書いた時刻・その中のページとバインダを書いた時刻・バインダの中のページを書いた時刻・開いた時刻の、いちばん新しい物。
	// 返すのはブック（library.go）と、開いた時刻だけが残る物（フォルダの行もエントリも無い id）。バインダは、入っているブックの時刻に数えるので、それ自身は返さない。
	// 書庫ホームとフォルダは返さない（ブックの時刻は、入っているフォルダに数えない）
	rows, err := s.db.Query(`SELECT id, MAX(t) FROM (
		SELECT id, updated_at AS t FROM folders
		UNION ALL SELECT e.folder, p.updated_at FROM pages p JOIN entries e ON e.id = p.id
		UNION ALL SELECT e.folder, f.updated_at FROM folders f JOIN entries e ON e.id = f.id
		UNION ALL SELECT up.folder, p.updated_at FROM pages p JOIN entries e ON e.id = p.id JOIN entries up ON up.id = e.folder
		UNION ALL SELECT id, at FROM opened)
		WHERE id NOT IN (` + notBookSQL + `) AND (id IN (SELECT id FROM folders) OR id NOT IN (SELECT id FROM entries)) GROUP BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, at string
		if err := rows.Scan(&id, &at); err != nil {
			return nil, err
		}
		out[id] = at
	}
	return out, rows.Err()
}

func (s *sqliteStorage) Open(id, at string) error {
	_, err := s.db.Exec(`INSERT INTO opened (id, at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at`, id, at)
	return err
}

func (s *sqliteStorage) Pages() ([]Page, error) {
	rows, err := s.db.Query(`SELECT id, body, version FROM pages ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	pages := []Page{}
	for rows.Next() {
		var p Page
		var body string
		if err := rows.Scan(&p.ID, &body, &p.Version); err != nil {
			return nil, err
		}
		p.Body = json.RawMessage(body)
		pages = append(pages, p)
	}
	return pages, rows.Err()
}

func (s *sqliteStorage) Folders() ([]Folder, error) {
	rows, err := s.db.Query(`SELECT id, body, version FROM folders ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	folders := []Folder{}
	for rows.Next() {
		var f Folder
		var body string
		if err := rows.Scan(&f.ID, &body, &f.Version); err != nil {
			return nil, err
		}
		f.Body = json.RawMessage(body)
		folders = append(folders, f)
	}
	return folders, rows.Err()
}

func (s *sqliteStorage) Entries() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT id, folder FROM entries`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, folder string
		if err := rows.Scan(&id, &folder); err != nil {
			return nil, err
		}
		out[id] = folder
	}
	return out, rows.Err()
}

// apply は f を 1 つのトランザクションで行う（f が error を返したら巻き戻す）
func (s *sqliteStorage) apply(f func(tx *sql.Tx) error) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := f(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *sqliteStorage) Apply(b Batch) error {
	return s.apply(func(tx *sql.Tx) error {
		for _, w := range b.Pages {
			if err := txPutRow(tx, "pages", w); err != nil {
				return err
			}
		}
		for _, w := range b.Folders {
			if err := txPutRow(tx, "folders", w); err != nil {
				return err
			}
		}
		// 出て行く分（どこにも入らなくなった・入っているフォルダが替わる）を先に消してから、入れる（同じエントリを 2 つのフォルダに入れる書き込みは、主キーが断る）
		for _, e := range b.Entries {
			if _, err := tx.Exec(`DELETE FROM entries WHERE id = ?`, e.ID); err != nil {
				return err
			}
		}
		for _, e := range b.Entries {
			if e.Folder == "" {
				continue
			}
			if _, err := tx.Exec(`INSERT INTO entries (id, folder) VALUES (?, ?)`, e.ID, e.Folder); err != nil {
				return err
			}
		}
		for _, id := range b.RemovedBooks {
			if _, err := tx.Exec(`DELETE FROM opened WHERE id = ?`, id); err != nil {
				return err
			}
		}
		for _, u := range []struct {
			table string
			body  *UserBody
		}{{"settings", b.Settings}} {
			if u.body == nil {
				continue
			}
			if err := txPutUser(tx, u.table, u.body.User, u.body.Body); err != nil {
				return err
			}
		}
		for _, a := range b.Annotations {
			if err := txPutList(tx, "page_annotations", "page", a.Page, a.Body); err != nil {
				return err
			}
		}
		if b.AIEditTickets != nil {
			if err := txPutTickets(tx, b.AIEditTickets); err != nil {
				return err
			}
		}
		for _, r := range b.Records {
			if err := s.txPutRecord(tx, r); err != nil {
				return err
			}
		}
		for _, t := range b.SearchTexts {
			if err := txPutSearchText(tx, t); err != nil {
				return err
			}
		}
		for _, c := range b.Counters {
			if _, err := tx.Exec(`INSERT INTO counters (subject, scope, next) VALUES (?, ?, ?)
				ON CONFLICT(subject, scope) DO UPDATE SET next = excluded.next`, c.Subject, c.Scope, c.Next); err != nil {
				return err
			}
		}
		return nil
	})
}

// txPutRecord は、レコード 1 件を書く（置いてある版が Base のときだけ。作るときは Base 0 で、まだ無いときだけ。消すときも版を確かめる）。
// 種類の表があればそこに、索引キーの値と一緒に書く。無ければ、中を解釈しない表 records に書く
func (s *sqliteStorage) txPutRecord(tx *sql.Tx, w RecordWrite) error {
	k, known := s.kinds[w.Subject]
	table, match, args := "records", "subject = ? AND id = ?", []any{w.Subject, w.ID}
	if known {
		table, match, args = k.table, "id = ?", []any{w.ID}
	}
	var version int64
	err := tx.QueryRow(`SELECT version FROM `+table+` WHERE `+match, args...).Scan(&version)
	have := !errors.Is(err, sql.ErrNoRows)
	if err != nil && have {
		return err
	}
	if (have && version != w.Base) || (!have && w.Base != 0) {
		return ErrConflict
	}
	cols, marks, sets := "", "", ""
	var keys []any
	if known {
		keys = keyArgs(k, w.Keys)
		for i := range k.keys {
			cols += fmt.Sprintf(", k%d", i)
			marks += ", ?"
			sets += fmt.Sprintf(", k%d = ?", i)
		}
	}
	switch {
	case w.Removed:
		_, err = tx.Exec(`DELETE FROM `+table+` WHERE `+match, args...)
	case !have && known:
		_, err = tx.Exec(`INSERT INTO `+table+` (id, body, version, updated_at`+cols+`) VALUES (?, ?, 1, ?`+marks+`)`, append([]any{w.ID, string(w.Body), now()}, keys...)...)
	case !have:
		_, err = tx.Exec(`INSERT INTO records (subject, id, body, version, updated_at) VALUES (?, ?, ?, 1, ?)`, w.Subject, w.ID, string(w.Body), now())
	default:
		_, err = tx.Exec(`UPDATE `+table+` SET body = ?, version = ?, updated_at = ?`+sets+` WHERE `+match, append(append([]any{string(w.Body), w.Base + 1, now()}, keys...), args...)...)
	}
	return err
}

func (s *sqliteStorage) Records() ([]Record, error) {
	query := `SELECT subject, id, body, version FROM records`
	var args []any
	for subject, k := range s.kinds {
		query += ` UNION ALL SELECT ?, id, body, version FROM ` + k.table
		args = append(args, subject)
	}
	rows, err := s.db.Query(query+` ORDER BY 1, 2`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Record{}
	for rows.Next() {
		var r Record
		var body string
		if err := rows.Scan(&r.Subject, &r.ID, &body, &r.Version); err != nil {
			return nil, err
		}
		r.Body = json.RawMessage(body)
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *sqliteStorage) Counters() ([]Counter, error) {
	rows, err := s.db.Query(`SELECT subject, scope, next FROM counters ORDER BY subject, scope`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Counter{}
	for rows.Next() {
		var c Counter
		if err := rows.Scan(&c.Subject, &c.Scope, &c.Next); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// txPutRow は、ページかフォルダの表 table の 1 行を書く（置いてある版が Base のときだけ。作るときは Base 0 で、まだ無いときだけ。消すときも版を確かめる）。
// 版が違えば ErrConflict
func txPutRow(tx *sql.Tx, table string, w RowWrite) error {
	var version int64
	err := tx.QueryRow(`SELECT version FROM `+table+` WHERE id = ?`, w.ID).Scan(&version)
	have := !errors.Is(err, sql.ErrNoRows)
	if err != nil && have {
		return err
	}
	if (have && version != w.Base) || (!have && w.Base != 0) {
		return ErrConflict
	}
	switch {
	case w.Removed:
		_, err = tx.Exec(`DELETE FROM `+table+` WHERE id = ?`, w.ID)
	case !have:
		_, err = tx.Exec(`INSERT INTO `+table+` (id, body, version, updated_at) VALUES (?, ?, 1, ?)`, w.ID, string(w.Body), now())
	default:
		_, err = tx.Exec(`UPDATE `+table+` SET body = ?, version = ?, updated_at = ? WHERE id = ?`, string(w.Body), w.Base+1, now(), w.ID)
	}
	return err
}

// txPutUser は、利用者ごとの表 table（settings・participant_notes）の user の行を置き換える
func txPutUser(tx *sql.Tx, table, user string, body json.RawMessage) error {
	_, err := tx.Exec(`INSERT INTO `+table+` (user, body, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(user) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`, user, string(body), now())
	return err
}

// txPutList は、並びを 1 行に持つ表 table（page_annotations）の、鍵の列 column が key の行を置き換える（空の並びなら消す）
func txPutList(tx *sql.Tx, table, column, key string, body json.RawMessage) error {
	if empty(body) {
		_, err := tx.Exec(`DELETE FROM `+table+` WHERE `+column+` = ?`, key)
		return err
	}
	_, err := tx.Exec(`INSERT INTO `+table+` (`+column+`, body, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(`+column+`) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`, key, string(body), now())
	return err
}

func (s *sqliteStorage) Annotations() (map[string]json.RawMessage, error) {
	rows, err := s.db.Query(`SELECT page, body FROM page_annotations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	all := map[string]json.RawMessage{}
	for rows.Next() {
		var page, body string
		if err := rows.Scan(&page, &body); err != nil {
			return nil, err
		}
		all[page] = json.RawMessage(body)
	}
	return all, rows.Err()
}

// txPutTickets は、AI 編集チケットの並びの全部（表 ai_edit_tickets の 1 行）を置き換える（空の並びなら消す）
func txPutTickets(tx *sql.Tx, body json.RawMessage) error {
	if empty(body) {
		_, err := tx.Exec(`DELETE FROM ai_edit_tickets`)
		return err
	}
	_, err := tx.Exec(`INSERT INTO ai_edit_tickets (id, body, updated_at) VALUES (1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`, string(body), now())
	return err
}

func (s *sqliteStorage) AIEditTickets() (json.RawMessage, error) {
	var body string
	err := s.db.QueryRow(`SELECT body FROM ai_edit_tickets`).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(body), nil
}

func (s *sqliteStorage) PutAIEditTickets(body json.RawMessage) error {
	return s.Apply(Batch{AIEditTickets: body})
}

// empty は、並びの JSON が空（[] か null）か
func empty(body json.RawMessage) bool {
	var list []json.RawMessage
	return json.Unmarshal(body, &list) == nil && len(list) == 0
}

func (s *sqliteStorage) Settings(user string) (json.RawMessage, error) {
	var body string
	err := s.db.QueryRow(`SELECT body FROM settings WHERE user = ?`, user).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(body), nil
}

func (s *sqliteStorage) ParticipantNotes(user string) (json.RawMessage, error) {
	var body string
	err := s.db.QueryRow(`SELECT body FROM participant_notes WHERE user = ?`, user).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(body), nil
}

func (s *sqliteStorage) PutParticipantNotes(user string, body json.RawMessage) error {
	return s.apply(func(tx *sql.Tx) error { return txPutUser(tx, "participant_notes", user, body) })
}

func (s *sqliteStorage) Close() error { return s.db.Close() }

func (s *sqliteStorage) RanOnce() (map[string]bool, error) {
	rows, err := s.db.Query(`SELECT action FROM ran_once`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

func (s *sqliteStorage) MarkRanOnce(id string) error {
	_, err := s.db.Exec(`INSERT OR IGNORE INTO ran_once (action) VALUES (?)`, id)
	return err
}
