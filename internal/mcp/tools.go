package mcp

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
)

// instructions は、つないだ AI に渡す matomezu の説明
const instructions = "matomezu shows books (such as diagrams) to the user in a browser. " +
	"Use view to see what the user is looking at, list_books, read_book and read_page to read, actions to see what can be done, and perform to do it. " +
	"The user may put notes and marks on things in a book; view and list_books tell you which wait for your answer (awaiting), and actions describes each kind of annotation and how to answer it. " +
	"Changes appear at once on screens showing that book; use show to put a book on the user's screen. "

type readTool struct {
	name        string
	description string
	schema      map[string]any
	call        func(api caller, args map[string]any) (json.RawMessage, error)
}

var noArgs = map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": false}

// mailSchema は read_mail の受ける形: 取り方（一覧の limit・before・unseen・unvisited か、全文の ids）
var mailSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"limit":     map[string]any{"type": "integer", "minimum": 1, "maximum": 100, "description": "How many letters to list, newest first (default 20)."},
		"before":    map[string]any{"type": "string", "description": "The id of a letter: list the letters older than it (not it). Give the oldest id of the list you have, to go back."},
		"unseen":    map[string]any{"type": "boolean", "description": "true: only the letters the user has not opened yet."},
		"unvisited": map[string]any{"type": "boolean", "description": "true: only the letters that point at a place the user has not seen yet."},
		"ids": map[string]any{
			"type": "array", "items": map[string]any{"type": "string"}, "minItems": 1, "maxItems": 20,
			"description": "The ids of letters to read in full (props too; from the list). Not together with limit, before, unseen or unvisited.",
		},
	},
	"additionalProperties": false,
}

// mailQuery は、read_mail の args を常駐の口の問い合わせにする（渡された取り方だけ）
func mailQuery(args map[string]any) string {
	q := url.Values{}
	if list, ok := args["ids"].([]any); ok {
		for _, v := range list {
			if id, ok := v.(string); ok {
				q.Add("ids", id)
			}
		}
	}
	if n, ok := args["limit"].(float64); ok {
		q.Set("limit", strconv.FormatFloat(n, 'f', -1, 64))
	}
	if id, ok := args["before"].(string); ok {
		q.Set("before", id)
	}
	for _, name := range []string{"unseen", "unvisited"} {
		if on, ok := args[name].(bool); ok && on {
			q.Set(name, "1")
		}
	}
	return "?" + q.Encode()
}

var readTools = []readTool{
	{
		"view",
		"What the user is looking at now: the book, page, mode (edit, or print-preview: all its pages laid out as the sheets they print on, arranged by the book's print preview settings) and selected items of the matomezu window focused last, and awaiting, the annotations on that book (such as the user's notes and marks) that wait for your answer, each with its page. front tells what the window brings to front: book-screen, or control-center, which covers the book screen; then the book, page, mode, selection and awaiting of the book screen kept behind it are under hidden (the user does not see them now). null when no window is open.",
		noArgs,
		func(api caller, _ map[string]any) (json.RawMessage, error) { return api.Get("api/ai/view") },
	},
	{
		"list_books",
		"List the books: id, type, title, version and awaiting (how many annotations, such as the user's notes and marks, wait for your answer; left out when none). A book that cannot be read now (its book type is not installed, or it does not fit the type) has problem, the reason; it cannot be opened or changed until that is fixed. A book with items or settings of plugins that are not installed has warning; it can be read and changed, and those parts are kept as they are.",
		noArgs,
		func(api caller, _ map[string]any) (json.RawMessage, error) {
			return api.Get("api/ai/books")
		},
	},
	{
		"read_book",
		"Read a book: the book without its pages' contents (type, title, settings and so on), its pages as an outline (id, title, size in characters), its version and its annotations (such as the user's notes and marks: what they are tied to by anchors, the page of the last anchor, and awaiting, whether they wait for your answer). " +
			"Read the contents of a page with read_page.",
		map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"book": map[string]any{"type": "string", "description": "The book's id."}},
			"required":             []string{"book"},
			"additionalProperties": false,
		},
		func(api caller, args map[string]any) (json.RawMessage, error) {
			id, _ := args["book"].(string)
			return api.Get("api/ai/books/" + url.PathEscape(id) + "?outline=1") // 1 冊だけのブックの id は / を含む
		},
	},
	{
		"read_page",
		"Read one page of a book (the page and the items on it), the book's version, placed (where each shape is drawn, when the book type's presentation tells it, otherwise null: {id, x, y, w, h} with the top-left on the paper and the size as drawn, children too; use it to line shapes up, as the items' own x and y are from their parent and their w and h may be missing or smaller than drawn) and the annotations (such as the user's notes and marks) standing on things of that page. " +
			"A page too large to be answered at once is refused (too-large): with outline, the page's items are an outline (id, item, size in characters); with item, only that item (and what is inside it), its placed and the annotations on them are answered.",
		map[string]any{
			"type": "object",
			"properties": map[string]any{
				"book":    map[string]any{"type": "string", "description": "The book's id."},
				"page":    map[string]any{"type": "string", "description": "The page's id (see read_book or view)."},
				"outline": map[string]any{"type": "boolean", "description": "Answer the page's items as an outline (id, item, size in characters) instead of in full."},
				"item":    map[string]any{"type": "string", "description": "The id of an item on the page (any depth): answer only that item and what is inside it."},
			},
			"required":             []string{"book", "page"},
			"additionalProperties": false,
		},
		func(api caller, args map[string]any) (json.RawMessage, error) {
			book, _ := args["book"].(string)
			page, _ := args["page"].(string)
			q := url.Values{}
			if outline, _ := args["outline"].(bool); outline {
				q.Set("outline", "1")
			}
			if item, _ := args["item"].(string); item != "" {
				q.Set("item", item)
			}
			path := "api/ai/books/" + url.PathEscape(book) + "/pages/" + url.PathEscape(page)
			if len(q) > 0 {
				path += "?" + q.Encode()
			}
			return api.Get(path)
		},
	},
	{
		"read_settings",
		"Read the user's settings: the value of each setting in actions, keyed by the setting's id (a setting the user has not changed has its default, or is left out when it has none).",
		noArgs,
		func(api caller, _ map[string]any) (json.RawMessage, error) { return api.Get("api/ai/settings") },
	},
	{
		"read_mail",
		"Read the user's mailbox. Without ids it lists the letters newest first, 20 by default (limit: up to 100) without their props: " +
			"id, mail (the kind), from, sentAt, to (the place it points at), seenAt (when the user opened the letter; left out: not yet), visitedAt (when the user saw the place it points at; left out: not yet) and title (a line that tells the letter apart; left out when its kind gives none). " +
			"total is how many letters fit what you asked (unseen, unvisited), and older how many of them are older than the oldest one listed: give that letter's id as before to go back. " +
			"unseen lists only the letters the user has not opened yet, unvisited only the letters that point at a place the user has not seen yet. " +
			"With ids (from the list, up to 20; not together with the other arguments) it answers the whole letters, props too (title and body, and more for some kinds), and unknown, the ids it does not have. Send a letter with the action mail-send.",
		mailSchema,
		func(api caller, args map[string]any) (json.RawMessage, error) {
			return api.Get("api/ai/mail" + mailQuery(args))
		},
	},
	{
		"actions",
		"List what can be done now (it changes when plugins are added or removed). Without ids, it answers version (changes when the list changes: keep what you read while it stays the same) and index: " +
			"the actions (id, target and title: target tells what an action is done on), the items (shape or connector), the user settings, " +
			"the book types (which can be created, whether they have pages and which items they place), the kinds of annotations and mail, the subjects (kinds of records that actions work on, with the shape of a record; perform takes on.record for them), the themes, the colors by role, the language packs (the language setting takes a pack id), the skins and the text colors. " +
			"With ids (ids from the index), it answers the whole entry of each: an action's description and args (JSON Schema, for perform), an item's props (JSON Schema) and default size, a setting's schema; unknown lists ids it does not have. " +
			"warnings (only when there are some, without ids) lists the problems that hold now, one line each with its code (W and 3 digits), found by the host or by the user's screens: " +
			"definitions that partly do not work, books that cannot be read, added plugins a screen could not set up (W011: their actions still work, but the user does not see what they draw).",
		actionsSchema,
		func(api caller, args map[string]any) (json.RawMessage, error) {
			return api.Get("api/ai/catalog" + idsQuery(args))
		},
	},
}

// actionsSchema は actions の受ける形。ids は 1 つ以上の id（actions の目次の id）
var actionsSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"ids": map[string]any{
			"type":        "array",
			"items":       map[string]any{"type": "string"},
			"minItems":    1,
			"description": "The ids to answer in full (see the index you get without ids): actions, items, settings and so on.",
		},
	},
	"additionalProperties": false,
}

// idsQuery は、args の ids を常駐の口の問い合わせにする（無ければ空。目次を返す）
func idsQuery(args map[string]any) string {
	q := url.Values{}
	if list, ok := args["ids"].([]any); ok {
		for _, v := range list {
			if id, ok := v.(string); ok {
				q.Add("ids", id)
			}
		}
	}
	if len(q) == 0 {
		return ""
	}
	return "?" + q.Encode()
}

// performSchema は perform の受ける形
var performSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"action": map[string]any{"type": "string", "description": "The action's id (see actions)."},
		"args":   map[string]any{"type": "object", "description": "The action's arguments, matching its args in actions."},
		"on": map[string]any{
			"type":        "object",
			"description": "What the action is done on: the book, for an action whose target is book (or annotations); the record, for an action whose target is a subject listed in actions (subjects). Leave on out to make a new record.",
			"properties": map[string]any{
				"book":   map[string]any{"type": "string", "description": "The book's id."},
				"record": map[string]any{"type": "string", "description": "The record's id."},
			},
			"additionalProperties": false,
		},
		"timeoutSec": map[string]any{"type": "integer", "minimum": 1, "maximum": 60, "description": "How many seconds to wait for the action (5 without it). Give more (up to 60) only for an action you know is heavy; an action that takes longer is stopped and refused with nothing changed."},
	},
	"required":             []string{"action", "args"},
	"additionalProperties": false,
}

const performDescription = "Perform an action listed by actions, as the user would on the screen: the change appears at once on screens showing that book. " +
	"Returns the action's result (such as the id of what it made), with a notice on the next line when the action changed something else you should know (such as positions), or why it was refused."

// showSchema は show の受ける形
var showSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"book":  map[string]any{"type": "string", "description": "The book's id."},
		"page":  map[string]any{"type": "string", "description": "The page to show. Without it, the book opens as usual."},
		"stage": map[string]any{"type": "string", "description": "The id of the stage to show it on (see view). Without it, the current stage."},
		"split": map[string]any{"type": "boolean", "description": "Split that stage and show the book on the new stage at its right."},
		"mode": map[string]any{
			"type":        "string",
			"enum":        []string{"edit", "print-preview"},
			"description": "print-preview shows all its pages as the sheets they print on (a book with pages; the user only looks, nothing can be changed there). Without it, edit.",
		},
	},
	"required":             []string{"book"},
	"additionalProperties": false,
}

const showDescription = "Show a book on the user's screen: in the matomezu window focused last, open it on a stage, which becomes current, and the book screen comes to front if the control center was in front. " +
	"When no window is open, a browser opens matomezu first (this can take some seconds)."

// listTools は MCP 公開ツールの一覧（読む MCP 公開ツール・show・perform・join）。追加プラグインを足しても変わらない
func listTools() []map[string]any {
	tools := []map[string]any{}
	for _, t := range readTools {
		tools = append(tools, map[string]any{"name": t.name, "description": t.description, "inputSchema": t.schema})
	}
	tools = append(tools,
		map[string]any{"name": "show", "description": showDescription, "inputSchema": showSchema},
		map[string]any{"name": "perform", "description": performDescription, "inputSchema": performSchema},
		map[string]any{"name": "join", "description": joinDescription, "inputSchema": joinSchema},
	)
	return tools
}

// callTool は MCP 公開ツールを呼び、AI に返す文と、失敗したかを返す。
// 常駐の返事に AI への知らせ（参加しましたなど）があれば、どの MCP 公開ツールでも文の末尾に足す
func callTool(c *conn, name string, raw json.RawMessage) (string, bool) {
	c.notice = ""
	text, failed := dispatch(c, name, raw)
	if c.notice != "" {
		text += "\n" + c.notice
		c.notice = ""
	}
	return text, failed
}

// maxAnswer は、読む MCP 公開ツールの 1 つの答えの文字数の上限。受け取る側（AI のクライアント）に上限があり、超えると途中で切れて AI が気づけないので、
// 絞って読めるツールは、超える答えを返さずに絞り方を返す
const maxAnswer = 60000

// tooLarge は、答えが上限を超えたときの、絞り方の説明（絞って読めるツールだけ）
var tooLarge = map[string]func(args map[string]any) string{
	"read_page": func(args map[string]any) string {
		if item, _ := args["item"].(string); item != "" {
			return "read an item inside it: call read_page with outline to see the items of the page, or read_page with the id of an item inside this one"
		}
		return "call read_page with outline to see the items of the page (id, item, size), then with item to read them one at a time"
	},
}

func dispatch(c *conn, name string, raw json.RawMessage) (string, bool) {
	var api caller = c
	args := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &args); err != nil {
			return "the arguments are not a JSON object", true
		}
	}
	for _, t := range readTools {
		if t.name == name {
			out, err := t.call(api, args)
			if err != nil {
				return err.Error(), true
			}
			if narrow, ok := tooLarge[name]; ok {
				if n := len([]rune(string(out))); n > maxAnswer {
					return fmt.Sprintf("too-large: the answer is %d characters, over the limit of %d, so it is not returned; %s", n, maxAnswer, narrow(args)), true
				}
			}
			return string(out), false
		}
	}
	if name == "show" {
		return show(api, args)
	}
	if name == "perform" {
		return perform(api, args)
	}
	if name == "join" {
		return join(c, args)
	}
	return "unknown tool: " + name, true
}

func perform(api caller, args map[string]any) (string, bool) {
	if _, ok := args["action"].(string); !ok {
		return "perform needs action (an action's id, see actions)", true
	}
	if _, ok := args["args"].(map[string]any); !ok {
		args["args"] = map[string]any{}
	}
	out, err := api.Post("api/ai/perform", args)
	if err != nil {
		return err.Error(), true
	}
	var done struct {
		OK     bool            `json:"ok"`
		Reason string          `json:"reason"`
		Detail string          `json:"detail"`
		Result json.RawMessage `json:"result"`
		Notice string          `json:"notice"` // AI への知らせ（可変ページの中身をずらして位置が変わったなど）
	}
	if err := json.Unmarshal(out, &done); err != nil {
		return string(out), true
	}
	if !done.OK {
		text := refusalText(done.Reason, done.Detail)
		if done.Reason == "bad-args" {
			text += argsSchemaOf(api, args["action"].(string))
		}
		return text, true
	}
	// 知らせは結果の次の行に添える
	if done.Notice != "" {
		return string(done.Result) + "\n" + done.Notice, false
	}
	return string(done.Result), false
}

// argsSchemaOf は、引数が合わないと断ったアクションの引数の Schema（添えて、AI が 1 回で直せるように）。取れなければ空
func argsSchemaOf(api caller, action string) string {
	out, err := api.Get("api/ai/catalog?ids=" + url.QueryEscape(action))
	if err != nil {
		return ""
	}
	var got struct {
		Actions []struct {
			Args json.RawMessage `json:"args"`
		} `json:"actions"`
	}
	if json.Unmarshal(out, &got) != nil || len(got.Actions) == 0 {
		return ""
	}
	return "\nthe args of " + action + " (JSON Schema): " + string(got.Actions[0].Args)
}

func show(api caller, args map[string]any) (string, bool) {
	out, err := api.Post("api/ai/show", args)
	if err != nil {
		return err.Error(), true
	}
	var done struct {
		OK     bool   `json:"ok"`
		Opened bool   `json:"opened"`
		Reason string `json:"reason"`
		Detail string `json:"detail"`
		URL    string `json:"url"`
	}
	if err := json.Unmarshal(out, &done); err != nil {
		return string(out), true
	}
	switch {
	case done.OK && done.Opened:
		return "shown in a browser window opened for it", false
	case done.OK:
		return "shown", false
	case done.Reason == "no-browser":
		return "no-browser: could not open a browser (" + done.Detail + "); ask the user to open " + done.URL + " and call show again", true
	case done.Reason == "no-book":
		return "no-book: there is no book with that id (see list_books)", true
	case done.Reason == "no-window":
		return "no-window: no matomezu window connected; ask the user to open " + done.URL + " and call show again", true
	case done.Reason == "no-stage":
		return "no-stage: the window has no stage with that id (see view)", true
	case done.Reason == "no-split":
		return "no-split: the window cannot split more; give the stage to show it on instead (see view)", true
	}
	return refusalText(done.Reason, done.Detail), true
}

// refusalText は断った理由の、AI に返す 1 行。常駐が決めた理由のほかは、エンジンが添えた AI への説明（detail）を使う
func refusalText(reason, detail string) string {
	switch {
	case reason == "unreadable":
		return "unreadable: the book cannot be read now (" + detail + "); it cannot be changed until that is fixed (see list_books)"
	case reason == "open-on-screen":
		return "open-on-screen: the book is shown on the user's screen now, so it was not moved to the trash; ask the user in the chat"
	case reason == "being-edited":
		return "being-edited: the user is editing what this would change or remove (such as a note open on the screen), so nothing was changed; do it again later, " +
			"or send the change to the user if actions offer a way (an action that carries actions for the user to apply)"
	case reason == "bad-args":
		return "bad-args: the args do not fit the action"
	case detail != "":
		return reason + ": " + detail
	default:
		return reason + ": it could not be done here (read_page to check)"
	}
}

// joinSchema は join の受ける形。AI の名前と環境は MCP が埋めるので受けない
var joinSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"model":       map[string]any{"type": "string", "description": "The name of the model you are, such as claude-opus-4 or gpt-5."},
		"sessionName": map[string]any{"type": "string", "description": "The name of this session, if it has one."},
		"link":        map[string]any{"type": "string", "description": "A one-time passphrase: a new uuid (8-4-4-4-12 hex digits) you make for this session. The hook that runs when the user talks finds it in this session's transcript to tie the session to you, so put it in this call as it is. Use the same link when you ask again."},
		"workroom":    map[string]any{"type": "string", "description": "The name of the workroom you would like to continue (a participant who joined before and is not alive any more), or the name you would like for a new one (up to 20 characters). The user chooses on the screen. Optional."},
	},
	"required":             []string{"model", "link"},
	"additionalProperties": false,
}

const joinDescription = "Ask to join the user's workroom as a participant. The user accepts it on the screen; until then you are requested. " +
	"After the user accepts, you are not counted as a participant (your calls do not count, and no notice comes) until the hook that runs when the user talks to you tells them and you your workroom name; an AI whose calls carry the session id is counted as soon as it is accepted, and the notice comes with a later answer. Your tools work the same meanwhile. Call it once per session (asking again with the same link answers with the participant you already are). " +
	"With workroom, you say which workroom you would like to continue (the name you were given when you joined before) or the name you would like for a new one: it is refused with workroom-in-use while the workroom has a participant who is alive (do not ask again; tell the user in the chat). Otherwise the user chooses on the screen whether you take over a participant who joined before or start new. Use the same workroom name each time you continue the same work."

// join は参加を頼む。AI の名前と環境は MCP が埋め、受けた参加の id を以後の呼び出し全部に添える
func join(c *conn, args map[string]any) (string, bool) {
	model, _ := args["model"].(string)
	link, _ := args["link"].(string)
	if model == "" || link == "" {
		return "join needs model and link (a new uuid you make for this session)", true
	}
	sessionName, _ := args["sessionName"].(string)
	body := map[string]any{"ai": c.ai, "model": model, "env": c.env, "sessionName": sessionName, "link": link}
	if workroom, _ := args["workroom"].(string); workroom != "" {
		body["workroom"] = workroom
	}
	if c.sessionID != "" {
		body["sessionId"] = c.sessionID
	}
	out, err := c.Post("api/ai/join", body)
	if err != nil {
		return err.Error(), true
	}
	var done struct {
		OK          bool   `json:"ok"`
		Participant string `json:"participant"`
		Reason      string `json:"reason"`
		Detail      string `json:"detail"`
	}
	if err := json.Unmarshal(out, &done); err != nil {
		return string(out), true
	}
	if !done.OK {
		return refusalText(done.Reason, done.Detail), true
	}
	c.participant = done.Participant
	answer := map[string]any{"participant": done.Participant}
	reply, _ := json.Marshal(answer)
	return string(reply), false
}
