package engine

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/plugin"
)

const book = `{"id":"b1","title":"T","lineup":[{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P","paper":"@matomezu/base:a4","orientation":"landscape"}]}`

// rows は、ブックの本文（並びにページとバインダの中身ごと持つ形）を、置き場所と同じ形のページとフォルダの本文に分ける
func rows(body string) (pages, folders []json.RawMessage) {
	marshal := func(v any) json.RawMessage {
		raw, err := json.Marshal(v)
		if err != nil {
			panic(err)
		}
		return raw
	}
	// refs は lineup のエントリを id だけにして返し、ページ（とバインダの中のページ）を pages に、バインダを binders に足す
	var binders []json.RawMessage
	var refs func(lineup json.RawMessage) json.RawMessage
	refs = func(lineup json.RawMessage) json.RawMessage {
		var entries []json.RawMessage
		if json.Unmarshal(lineup, &entries) != nil {
			return json.RawMessage("[]")
		}
		out := []map[string]string{}
		for _, e := range entries {
			var head struct{ Kind, ID string }
			if err := json.Unmarshal(e, &head); err != nil {
				panic(err)
			}
			out = append(out, map[string]string{"kind": head.Kind, "id": head.ID})
			if head.Kind == "page" {
				pages = append(pages, e)
				continue
			}
			var fields map[string]json.RawMessage
			if err := json.Unmarshal(e, &fields); err != nil {
				panic(err)
			}
			delete(fields, "kind")
			fields["folderRole"] = json.RawMessage(`"binder"`)
			fields["lineup"] = refs(fields["lineup"])
			binders = append(binders, marshal(fields))
		}
		return marshal(out)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(body), &fields); err != nil {
		panic(err)
	}
	fields["folderRole"] = json.RawMessage(`"book"`)
	fields["lineup"] = refs(fields["lineup"])
	return pages, append([]json.RawMessage{marshal(fields)}, binders...)
}

// onBook は、in に、ブックの本文 body を分けたページとフォルダを持たせる
func onBook(in Input, body string) Input {
	in.Pages, in.Folders = rows(body)
	return in
}

// inLibrary は、in の Folders に、ブック books を順に入れた書庫ホームの行を足す（一覧が対象のアクションに、ホストが渡す形）
func inLibrary(in Input, books ...string) Input {
	refs := []string{}
	for _, id := range books {
		refs = append(refs, `{"kind":"book","id":"`+id+`"}`)
	}
	in.Folders = append(in.Folders, json.RawMessage(`{"folderRole":"home","id":"library-home","lineup":[`+strings.Join(refs, ",")+`]}`))
	return in
}

// rowOf は、変わった行の並びから id の行の本文を返す（無いか、消えていれば空）
func rowOf(changes []RowChange, id string) string {
	for _, c := range changes {
		if c.ID == id && !c.Removed {
			return string(c.Row)
		}
	}
	return ""
}

// changed は、rows のうち changes にある id の行を、新しい本文に替えた並び
func changed(rows []json.RawMessage, changes []RowChange) []json.RawMessage {
	out := []json.RawMessage{}
	for _, r := range rows {
		var head struct{ ID string }
		_ = json.Unmarshal(r, &head)
		if to := rowOf(changes, head.ID); to != "" {
			r = json.RawMessage(to)
		}
		out = append(out, r)
	}
	return out
}

func newEngine(t *testing.T) *Engine {
	t.Helper()
	e, err := New()
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func place(ids ...string) Input {
	return onBook(Input{Actions: []BulkAction{{
		Action: "@matomezu/paper:item-place",
		Args:   json.RawMessage(`{"item":"@matomezu/box:shape-nest-box","at":{"x":10,"y":20},"props":{"caption":"c"}}`),
		On:     &On{Page: "p1"},
		Lang:   "ja",
		IDs:    ids,
	}}}, book)
}

func TestPerformsTheSameActionAsTheScreen(t *testing.T) {
	e := newEngine(t)
	out, err := e.Perform(place("abc-123"))
	if err != nil || !out.OK {
		t.Fatalf("Perform = %+v, %v", out, err)
	}
	// 変わるのはページ p1 だけで、ブックのフォルダは変わらない
	page := rowOf(out.Pages, "p1")
	if string(out.Result) != `{"item":"abc123","at":{"x":10,"y":20}}` || len(out.Books) != 1 || out.Books[0] != "b1" || len(out.Pages) != 1 || len(out.Folders) != 0 ||
		!strings.Contains(page, `"id":"abc123","x":10,"y":20,"item":"@matomezu/box:shape-nest-box"`) {
		t.Fatalf("out = %s %v %+v %+v", out.Result, out.Books, out.Pages, out.Folders)
	}
	again, _ := e.Perform(place("abc-123"))
	if rowOf(again.Pages, "p1") != page {
		t.Fatalf("the same input gave another page:\n%s\n%s", rowOf(again.Pages, "p1"), page)
	}
}

func TestMakesIdsWhenNoneAreGiven(t *testing.T) {
	out, err := newEngine(t).Perform(place())
	if err != nil || !out.OK || !regexp.MustCompile(`^\{"item":"[0-9a-f]{10}","at":\{"x":10,"y":20\}\}$`).Match(out.Result) {
		t.Fatalf("Perform = %+v, %v", out, err)
	}
}

func TestRefusals(t *testing.T) {
	e := newEngine(t)
	cases := map[string]Input{
		"unknown":  {Actions: []BulkAction{{Action: "nope", Lang: "ja"}}},
		"no-page":  {Actions: []BulkAction{{Action: "@matomezu/paper:item-place", Args: place().Actions[0].Args, On: &On{Page: "p9"}, Lang: "ja"}}, Pages: place().Pages, Folders: place().Folders},
		"bad-args": {Actions: []BulkAction{{Action: "@matomezu/paper:item-place", Args: json.RawMessage(`{}`), On: &On{Page: "p1"}, Lang: "ja"}}, Pages: place().Pages, Folders: place().Folders},
	}
	for want, in := range cases {
		out, err := e.Perform(in)
		if err != nil || out.OK || out.Reason != want {
			t.Errorf("%s: %+v, %v", want, out, err)
		}
	}
}

// アクションが断った訳を添えたら（ほかの形を動かす所に置くなど）、AI への説明はその訳
func TestARefusalCarriesTheActionsReason(t *testing.T) {
	e := newEngine(t)
	first, err := e.Perform(place("a1"))
	if err != nil || !first.OK {
		t.Fatalf("Perform = %+v, %v", first, err)
	}
	in := place("a2")
	in.Pages = changed(in.Pages, first.Pages)
	out, err := e.Perform(in)
	if err != nil || out.OK || out.Reason != "refused" || !strings.HasPrefix(out.Detail, "it would move a1; a1 can hold children") {
		t.Fatalf("Perform on a1 = %+v, %v", out, err)
	}
}

// AI に見せる描いた位置と大きさ: w・h を書いていない箱は定義の大きさ、子で大きく描く内包ボックスは子が入る大きさで、子は紙の上の位置
func TestAIPlacedGivesWhereShapesAreDrawn(t *testing.T) {
	e := newEngine(t)
	const drawn = `{"id":"b1","title":"T","lineup":[{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[` +
		`{"id":"a","x":10,"y":20,"item":"@matomezu/box:shape-nest-box","w":64,"h":64,"props":{"caption":"","rule":true,"body":"","captionAlign":"center","bodyAlign":"left"},"shapes":[` +
		`{"id":"c","x":8,"y":40,"item":"@matomezu/box:shape-nest-box","w":300,"h":100,"props":{"caption":"","rule":true,"body":"","captionAlign":"center","bodyAlign":"left"}}]}]}]}`
	out, err := e.AIPlaced(json.RawMessage(drawn))
	if err != nil {
		t.Fatal(err)
	}
	var got map[string][]struct {
		ID         string
		X, Y, W, H float64
	}
	if err := json.Unmarshal(out, &got); err != nil || len(got["p1"]) != 2 {
		t.Fatalf("AIPlaced = %s, %v", out, err)
	}
	a, c := got["p1"][0], got["p1"][1]
	if a.ID != "a" || a.X != 10 || a.Y != 20 || a.W != 8+300+8 || a.H < 40+100 || c.ID != "c" || c.X != 18 || c.Y != 60 || c.W != 300 {
		t.Fatalf("placed = %+v", got)
	}
	if none, _ := e.AIPlaced(json.RawMessage(`{"type":"nope","id":"x"}`)); string(none) != "null" {
		t.Fatalf("AIPlaced of an unreadable book = %s", none)
	}
}

func TestLibraryAndSettingsActions(t *testing.T) {
	e := newEngine(t)
	out, err := e.Perform(inLibrary(onBook(Input{Actions: []BulkAction{{
		Action: "@matomezu/base:book-create",
		Args:   json.RawMessage(`{"title":"New"}`),
		Lang:   "ja",
		IDs:    []string{"nb"},
	}}}, book), "b1"))
	// 新しいブックは、書庫ホームの並びの末尾に入る
	if err != nil || !out.OK || len(out.Books) != 1 || out.Books[0] != "nb" || len(out.Pages) != 0 || len(out.Folders) != 2 || len(out.Created) != 1 || out.Created[0] != "nb" ||
		rowOf(out.Folders, "nb") != `{"id":"nb","title":"New","folderRole":"book","lineup":[]}` ||
		!regexp.MustCompile(`"lineup":\[\{[^}]*"b1"[^}]*\},\{[^}]*"nb"[^}]*\}\]`).MatchString(rowOf(out.Folders, "library-home")) {
		t.Fatalf("@matomezu/base:book-create = %+v, %v", out, err)
	}
	out, err = e.Perform(Input{Actions: []BulkAction{{Action: "@matomezu/base:settings-set", Args: json.RawMessage(`{"values":{"@matomezu/base:lang":"matomezu:en"}}`), Lang: "ja"}}, Settings: json.RawMessage(`{"@matomezu/base:lang":"matomezu:ja"}`)})
	if err != nil || !out.OK || string(out.Settings) != `{"@matomezu/base:lang":"matomezu:en"}` {
		t.Fatalf("@matomezu/base:settings-set = %+v %s, %v", out, out.Settings, err)
	}
}

// AI が読む設定は、利用者の設定の項目の値（無いか形に合わなければ既定）で、機能台帳に無い項目は出さない
func TestAISettings(t *testing.T) {
	e := newEngine(t)
	got, err := e.AISettings(json.RawMessage(`{"@matomezu/base:lang":"matomezu:ja","@gone/x:y":1,"@matomezu/base:skin":"nothing"}`))
	if err != nil || string(got) != `{"@matomezu/base:lang":"matomezu:ja","@matomezu/base:skin":"auto","@matomezu/base:keys":{"added":[],"removed":[]},"@matomezu/base:text-colors":{},"@matomezu/base:tool-picker-hold":"250","@matomezu/base:note-expiry":"60","@matomezu/base:participant-alive":"60","@matomezu/base:corner-status-order":[],"@matomezu/base:soft-break":"line-break","@matomezu/markdown:tab-key":{"writes":"tab","spaces":4},"@matomezu/markdown:line-numbers":true,"@matomezu/markdown:current-line":false,"@matomezu/markdown:show-whitespace":false}` {
		t.Fatalf("ai settings = %s, %v", got, err)
	}
	if got, err := e.AISettings(nil); err != nil || !strings.Contains(string(got), `"@matomezu/base:skin":"auto"`) {
		t.Fatalf("ai settings of nothing = %s, %v", got, err)
	}
}

func TestAICatalogDescribesActionsAndItems(t *testing.T) {
	var c struct {
		Actions []struct {
			ID          string          `json:"id"`
			Target      string          `json:"target"`
			Description string          `json:"description"`
			Args        json.RawMessage `json:"args"`
		} `json:"actions"`
		Items []struct {
			ID    string          `json:"id"`
			Props json.RawMessage `json:"props"`
		} `json:"items"`
		Languages []struct {
			ID   string `json:"id"`
			Lang string `json:"lang"`
		} `json:"languages"`
		Skins    []string `json:"skins"`
		Settings []struct {
			ID     string          `json:"id"`
			Schema json.RawMessage `json:"schema"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(newEngine(t).AICatalogForTest(), &c); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, a := range c.Actions {
		if a.Description == "" {
			t.Errorf("%s has no description for the AI", a.ID)
		}
		if a.ID == "@matomezu/paper:item-place" {
			found = a.Target == "page" && !strings.Contains(string(a.Args), `"page"`) && strings.Contains(string(a.Args), `"required"`)
		}
	}
	langs := []string{}
	for _, l := range c.Languages {
		langs = append(langs, l.ID+"="+l.Lang)
	}
	schemas := map[string]string{}
	for _, s := range c.Settings {
		schemas[s.ID] = string(s.Schema)
	}
	if !found || len(c.Items) == 0 || !strings.Contains(string(c.Items[0].Props), `"caption"`) ||
		strings.Join(langs, ",") != "matomezu:en=en,matomezu:ja=ja" || strings.Join(c.Skins, ",") != "@matomezu/base:dark,@matomezu/base:light,@matomezu/base:matomezu-light,@matomezu/base:matomezu-dark" ||
		!strings.Contains(schemas["@matomezu/base:lang"], `"enum":["matomezu:en","matomezu:ja"]`) ||
		!strings.Contains(schemas["@matomezu/base:skin"], `"enum":["auto","@matomezu/base:dark","@matomezu/base:light","@matomezu/base:matomezu-light","@matomezu/base:matomezu-dark"]`) {
		t.Fatalf("ai catalog = %s", newEngine(t).AICatalogForTest())
	}
}

func TestAICatalogDescribesPageTypesAndItemKinds(t *testing.T) {
	var c struct {
		PageTypes []struct {
			ID       string          `json:"id"`
			Grouping string          `json:"grouping"`
			Grows    json.RawMessage `json:"grows"`
			Items    []string        `json:"items"`
			Themes   []string        `json:"themes"`
		} `json:"pageTypes"`
		Items []struct {
			ID   string `json:"id"`
			Kind string `json:"kind"`
		} `json:"items"`
	}
	if err := json.Unmarshal(newEngine(t).AICatalogForTest(), &c); err != nil {
		t.Fatal(err)
	}
	types := map[string]string{}
	grows := map[string]string{}
	themes := map[string]string{}
	for _, b := range c.PageTypes {
		types[b.ID] = fmt.Sprint(b.Grouping, " ", strings.Join(b.Items, ","))
		grows[b.ID] = string(b.Grows)
		themes[b.ID] = strings.Join(b.Themes, ",")
	}
	// タイプごとに使えるテーマ（テーマタイプの重なりは engine が計算して出す）
	if themes["@matomezu/drawing:drawing"] != "@matomezu/base:standard,@matomezu/base:sticky,@matomezu/base:simple,@matomezu/base:matomezu" ||
		themes["@matomezu/markdown:markdown"] != "@matomezu/base:standard,@matomezu/markdown:github-like" {
		t.Fatalf("themes = %v", themes)
	}
	// 利用者が選ぶ向きの一覧・タイプが決める・いつも可変ページ
	if grows["@matomezu/drawing:drawing"] != `["right-down","right","down","all"]` || grows["@matomezu/tree:tree"] != `"by-type"` ||
		grows["@matomezu/markdown:markdown"] != `"always"` {
		t.Fatalf("grows = %v", grows)
	}
	kinds := map[string]string{}
	for _, i := range c.Items {
		kinds[i.ID] = i.Kind
	}
	if !strings.HasPrefix(types["@matomezu/drawing:drawing"], "none ") || !strings.HasPrefix(types["@matomezu/slide-page:slide"], "binder ") || !strings.Contains(types["@matomezu/drawing:drawing"], "@matomezu/box:shape-nest-box") ||
		kinds["@matomezu/box:shape-box"] != "shape" || kinds["@matomezu/line:connector-line"] != "connector" {
		t.Fatalf("book types = %v, item kinds = %v", types, kinds)
	}
}

func TestAICatalogDescribesListRows(t *testing.T) {
	var c struct {
		Actions []struct {
			ID   string          `json:"id"`
			Args json.RawMessage `json:"args"`
		} `json:"actions"`
	}
	if err := json.Unmarshal(newEngine(t).AICatalogForTest(), &c); err != nil {
		t.Fatal(err)
	}
	args := map[string]string{}
	for _, a := range c.Actions {
		args[a.ID] = string(a.Args)
	}
	for _, id := range []string{"@matomezu/list:row-add", "@matomezu/list:row-update", "@matomezu/list:row-remove", "@matomezu/list:row-check", "@matomezu/list:row-lines"} {
		if args[id] == "" {
			t.Fatalf("%s is not in the ai catalog", id)
		}
	}
	for _, field := range []string{`"caption"`, `"rule"`, `"bodyAlign"`} {
		if !strings.Contains(args["@matomezu/list:row-add"], field) || !strings.Contains(args["@matomezu/list:row-update"], field) {
			t.Fatalf("row props lack %s: %s", field, args["@matomezu/list:row-add"])
		}
	}
}

// 線の道筋の計算（route）を通るアクションも、画面と同じに行える: つないだ箱が近ければどけ、手で直した区間が引けるかを確かめる
func TestConnectsItemsWithALine(t *testing.T) {
	e := newEngine(t)
	two := `{"id":"b1","title":"T","lineup":[{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[` +
		`{"id":"a","x":100,"y":100,"item":"@matomezu/box:shape-nest-box","w":100,"h":64,"props":{}},` +
		`{"id":"b","x":400,"y":300,"item":"@matomezu/box:shape-nest-box","w":100,"h":64,"props":{}}]}]}`
	out, err := e.Perform(onBook(Input{Actions: []BulkAction{{
		Action: "@matomezu/line:line-connect",
		Args:   json.RawMessage(`{"from":"a","to":"b","props":{"exitAt":0.4024,"enterAt":0.9024,"via":[300]}}`),
		On:     &On{Page: "p1"},
		Lang:   "ja",
		IDs:    []string{"l1"},
	}}}, two))
	if err != nil || !out.OK || string(out.Result) != `{"line":"l1"}` {
		t.Fatalf("Perform = %+v, %v", out, err)
	}
	if page := rowOf(out.Pages, "p1"); !strings.Contains(page, `{"id":"l1","item":"@matomezu/line:connector-line","from":"a","to":"b","props":{"exitAt":0.4024,"enterAt":0.9024,"via":[300]}}`) {
		t.Fatalf("page = %s", page)
	}
}

func usePlugin(t *testing.T, e *Engine, dir string) []string {
	t.Helper()
	b, err := plugin.Build(dir, e.Modules())
	if err != nil {
		t.Fatal(err)
	}
	ids, err := e.UseAllForTest([]*plugin.Bundle{b})
	if err != nil {
		t.Fatal(err)
	}
	return ids
}

// 追加プラグインは、利用者が設定で有効にするまで無効で、無効の間は名乗りと文言だけで組む（アクション・種類は AI にも出ない）。設定が変われば、有効になる
func TestAnAddedPluginIsOffUntilTheUserTurnsItOn(t *testing.T) {
	e := newEngine(t)
	b, err := plugin.Build("../../test/added-plugins/ex2", e.Modules())
	if err != nil {
		t.Fatal(err)
	}
	off := json.RawMessage(`{}`)
	if _, err := e.UseFor([]*plugin.Bundle{b}, off); err != nil {
		t.Fatal(err)
	}
	if got := e.Disabled(); len(got) != 1 || got[0] != "ex2" {
		t.Fatalf("disabled = %v, want [ex2]", got)
	}
	if c := string(e.AICatalogForTest()); strings.Contains(c, `ex2:`) {
		t.Fatalf("an off plugin shows up in the AI catalog: %s", c)
	}
	on := json.RawMessage(`{"@matomezu/base:enabled-plugins":["ex2"]}`)
	if now, err := e.DisabledFor(on); err != nil || len(now) != 0 {
		t.Fatalf("disabled for the enabled setting = %v, %v", now, err)
	}
	if now, err := e.DisabledFor(off); err != nil || len(now) != 1 {
		t.Fatalf("disabled for the empty setting = %v, %v", now, err)
	}
	if _, err := e.UseFor([]*plugin.Bundle{b}, on); err != nil {
		t.Fatal(err)
	}
	if len(e.Disabled()) != 0 || !strings.Contains(string(e.AICatalogForTest()), `"id":"ex2:diamond"`) {
		t.Fatalf("the enabled plugin is not assembled: disabled = %v", e.Disabled())
	}
}

func TestUsesAnAddedPlugin(t *testing.T) {
	e := newEngine(t)
	if ids := usePlugin(t, e, "../../test/added-plugins/ex2"); len(ids) != 1 || ids[0] != "ex2" {
		t.Fatalf("ids = %v", ids)
	}
	if c := string(e.AICatalogForTest()); !strings.Contains(c, `"id":"ex2:diamond"`) || !strings.Contains(c, `"ex2:flow"`) {
		t.Fatalf("the AI catalog lacks the added plugin: %s", c)
	}
	out, err := e.Perform(inLibrary(Input{Actions: []BulkAction{{
		Action: "@matomezu/base:book-create",
		Args:   json.RawMessage(`{"title":"Flow","page":{"type":"ex2:flow"}}`),
		Lang:   "ja",
		IDs:    []string{"fb", "fp"},
	}}}))
	if err != nil || !out.OK || len(out.Books) != 1 || out.Books[0] != "fb" || !strings.Contains(rowOf(out.Pages, "fp"), `"id":"fp","type":"ex2:flow"`) ||
		!strings.Contains(rowOf(out.Folders, "fb"), `"lineup":[{"kind":"page","id":"fp"}]`) {
		t.Fatalf("@matomezu/base:book-create = %+v, %v", out, err)
	}
}

func TestKeepsTheCatalogWhenAnAddedPluginDoesNotAssemble(t *testing.T) {
	e := newEngine(t)
	b := &plugin.Bundle{Dir: "bad", Manifest: plugin.Manifest{ID: "bad", Engine: "index.ts"}, Engine: `module.exports.default = { id: "bad", items: [{ id: "@matomezu/box:shape-box" }] }`}
	if _, err := e.UseAllForTest([]*plugin.Bundle{b}); err == nil || !strings.Contains(err.Error(), "E301") {
		t.Fatalf("err = %v", err)
	}
	none := &plugin.Bundle{Dir: "none", Manifest: plugin.Manifest{ID: "none", Engine: "index.ts"}, Engine: `module.exports.x = 1`}
	if _, err := e.UseAllForTest([]*plugin.Bundle{none}); err == nil || !strings.Contains(err.Error(), "export the plugin as default") {
		t.Fatalf("err = %v", err)
	}
	noID := &plugin.Bundle{Dir: "noid", Manifest: plugin.Manifest{ID: "noid", Engine: "index.ts"}, Engine: `module.exports.default = {}`}
	if _, err := e.UseAllForTest([]*plugin.Bundle{noID}); err == nil || !strings.Contains(err.Error(), "export the plugin as default") {
		t.Fatalf("err = %v", err)
	}
	other := &plugin.Bundle{Dir: "other", Manifest: plugin.Manifest{ID: "other", Engine: "index.ts"}, Engine: `module.exports.default = { id: "another" }`}
	if _, err := e.UseAllForTest([]*plugin.Bundle{other}); err == nil || !strings.Contains(err.Error(), `the id in matomezu.json is "other", but index.ts exports "another"`) {
		t.Fatalf("err = %v", err)
	}
	if out, err := e.Perform(place("p")); err != nil || !out.OK {
		t.Fatalf("Perform after a refused plugin = %+v, %v", out, err)
	}
}

// 追加プラグインは、ホストのエンジンの中でも matomezu の parseMarkdown で Markdown の原文を読める（名前の付いた文字の参照も、DOM なしで戻す）
func TestAnAddedPluginReadsMarkdownInTheEngine(t *testing.T) {
	e := newEngine(t)
	b := &plugin.Bundle{Dir: "reader", Manifest: plugin.Manifest{ID: "reader", Engine: "index.ts"}, Engine: `
var m = globalThis.__matomezuModules["matomezu"];
module.exports.default = {
  id: "reader",
  messages: { id: "reader:messages", messages: { "reader:read": { en: "Read" } } },
  actions: [{
    id: "reader:read", title: "reader:read", aiDescription: "", target: "book", attach: { books: true },
    args: m.z.strictObject({ text: m.z.string() }),
    run: function (b, args) {
      var doc = m.parseMarkdown(args.text);
      var h = doc.blocks[0];
      return { next: b, result: { kinds: doc.blocks.map(function (x) { return x.kind }), heading: h.children[0].value, footnotes: doc.footnotes.length } }
    }
  }]
}`}
	if _, err := e.UseAllForTest([]*plugin.Bundle{b}); err != nil {
		t.Fatal(err)
	}
	args, _ := json.Marshal(map[string]string{"text": "# A &amp; &copy;\n\n| a |\n|-|\n| x |\n\nn[^1]\n\n[^1]: f\n"})
	out, err := e.Perform(onBook(Input{Actions: []BulkAction{{Action: "reader:read", Args: args, On: &On{Book: "b1"}, Lang: "en"}}}, book))
	if err != nil || !out.OK {
		t.Fatalf("Perform = %+v, %v", out, err)
	}
	if got, want := string(out.Result), `{"kinds":["heading","table","paragraph"],"heading":"A & ©","footnotes":1}`; got != want {
		t.Fatalf("result = %s; want %s", got, want)
	}
}

// 新しい組で MCP 公開ツールの actions が返す物を作る所（アクションの describeArgs）が投げたら、組み直しは失敗し、定義も機能台帳も前のまま
func TestKeepsTheCatalogWhenTheAICatalogCannotBeMade(t *testing.T) {
	e := newEngine(t)
	before := string(e.AICatalogForTest())
	b := &plugin.Bundle{Dir: "thrower", Manifest: plugin.Manifest{ID: "thrower", Engine: "index.ts"}, Engine: `
var m = globalThis.__matomezuModules["matomezu"];
module.exports.default = {
  id: "thrower",
  messages: { id: "thrower:messages", messages: { "thrower:throw": { en: "Throw" } } },
  actions: [{
    id: "thrower:boom", title: "thrower:throw", aiDescription: "", target: "book", attach: { books: true },
    args: m.z.strictObject({}),
    describeArgs: function () { throw new Error("boom") },
    run: function (b) { return { next: b, result: {} } }
  }]
}`}
	if _, err := e.UseAllForTest([]*plugin.Bundle{b}); err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("err = %v", err)
	}
	if got := string(e.AICatalogForTest()); got != before {
		t.Fatalf("the AI catalog changed: %s", got)
	}
	out, err := e.Perform(Input{Actions: []BulkAction{{Action: "thrower:boom", Args: json.RawMessage(`{}`), On: &On{Book: "b1"}, Lang: "en"}}})
	if err != nil || out.OK || out.Reason != "unknown" {
		t.Fatalf("the failed plugin's action = %+v, %v; want unknown", out, err)
	}
}

func TestWarningLinesUseTheTable(t *testing.T) {
	e, err := New()
	if err != nil {
		t.Fatal(err)
	}
	lines, err := e.WarningLines(json.RawMessage(`[
		{"code":"W016","plugin":"acme","params":{"widget":"acme:w","target":"acme:x","slot":"top"}},
		{"code":"W999","plugin":"x","params":{}},
		{"code":"constructor","plugin":"x","params":{}},
		{"code":"__proto__","plugin":"x","params":{}},
		{"code":"W010","plugin":"acme","params":{"layout":"default","kind":"widget","id":"acme:w"}},
		"broken"
	]`))
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 2 || lines[0] != "W016 acme: widget acme:w: place names acme:x in slot top, which is not there (not placed)" ||
		lines[1] != "W010 acme: layout default: widget acme:w is skipped, as its plugin is not there" {
		t.Fatalf("lines = %q", lines)
	}
}

// ブックごと読めないのは、ブックの形が壊れた物（W005）だけ。タイプの無いページ（W027）は読めるブックの中の読めないページで、warning にそのページの id が付く
func TestCheckBooksSaysWhetherABookIsUnreadable(t *testing.T) {
	e := newEngine(t)
	noType := json.RawMessage(`{"id":"x1","title":"S","lineup":[{"kind":"page","id":"p1","type":"@foo/stamps:board","title":"P","paper":"@matomezu/base:a4","orientation":"landscape"},{"kind":"page","id":"p3","type":"@matomezu/drawing:drawing","title":"Q","paper":"@matomezu/base:a4","orientation":"landscape","items":[]}]}`)
	star := json.RawMessage(`{"id":"y1","title":"T","lineup":[{"kind":"page","id":"p2","type":"@matomezu/drawing:drawing","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[{"id":"s","item":"@foo/stars:star","x":1,"y":1,"props":{}}]}]}`)
	broken := json.RawMessage(`{"id":"z1","title":"U","lineup":"no"}`)
	found, err := e.CheckBooks([]json.RawMessage{noType, star, broken})
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]BookWarning{}
	for _, n := range found {
		n.Warning = ""
		got[n.Code] = n
	}
	want := map[string]BookWarning{
		"W027": {Entry: "x1", Code: "W027", Unreadable: true},
		"W007": {Entry: "y1", Code: "W007"},
		"W005": {Entry: "z1", Code: "W005", Unreadable: true},
	}
	if len(got) != len(want) {
		t.Fatalf("CheckBooks = %+v", found)
	}
	for code, w := range want {
		if got[code] != w {
			t.Fatalf("CheckBooks = %+v; want %+v", found, w)
		}
	}
}

// 利用者トリガートークのときに行うアクションは、runsWhenUserTalks を名乗ったものだけ（ビルトインでは伝言の note-talked）
func TestTalkActions(t *testing.T) {
	e := newEngine(t)
	ids, err := e.TalkActions()
	if err != nil || len(ids) != 1 || ids[0] != "@matomezu/base:note-talked" {
		t.Fatalf("talk actions = %v, %v", ids, err)
	}
}

func TestAICatalogIndexListsEverythingAndEntriesGiveTheFullText(t *testing.T) {
	e := newEngine(t)
	var idx struct {
		Version string `json:"version"`
		Index   struct {
			Actions  []map[string]json.RawMessage `json:"actions"`
			Items    []map[string]json.RawMessage `json:"items"`
			Settings []map[string]json.RawMessage `json:"settings"`
			Mails    []map[string]json.RawMessage `json:"mails"`
		} `json:"index"`
	}
	raw := e.AICatalogIndex()
	if err := json.Unmarshal(raw, &idx); err != nil {
		t.Fatal(err)
	}
	// 目次は、大きい表の物を全部、id と題名だけで並べる（引数の Schema・説明は無い）。郵便の種類のような小さい表は全文
	if len(idx.Index.Actions) == 0 || len(idx.Index.Items) == 0 || len(idx.Index.Settings) == 0 || len(idx.Index.Mails) == 0 {
		t.Fatalf("the index misses a table: %s", raw)
	}
	for _, a := range idx.Index.Actions {
		if _, has := a["args"]; has || a["id"] == nil || a["target"] == nil || a["title"] == nil {
			t.Fatalf("an action in the index = %v", a)
		}
	}
	if _, has := idx.Index.Items[0]["props"]; has {
		t.Fatalf("an item in the index has props: %v", idx.Index.Items[0])
	}
	if _, has := idx.Index.Mails[0]["props"]; !has {
		t.Fatalf("a mail kind in the index is not whole: %v", idx.Index.Mails[0])
	}
	if len(raw) > 20000 || len(raw)*3 > len(e.AICatalogForTest()) {
		t.Fatalf("the index is %d characters of %d", len(raw), len(e.AICatalogForTest()))
	}
	if len(idx.Version) != 12 || idx.Version != strings.TrimSpace(idx.Version) {
		t.Fatalf("version = %q", idx.Version)
	}

	var got struct {
		Version string                       `json:"version"`
		Actions []map[string]json.RawMessage `json:"actions"`
		Items   []map[string]json.RawMessage `json:"items"`
		Unknown []string                     `json:"unknown"`
	}
	if err := json.Unmarshal(e.AICatalogEntries([]string{"@matomezu/paper:item-place", "@matomezu/box:shape-box", "nope"}), &got); err != nil {
		t.Fatal(err)
	}
	if got.Version != idx.Version || len(got.Actions) != 1 || len(got.Items) != 1 || strings.Join(got.Unknown, ",") != "nope" ||
		!strings.Contains(string(got.Actions[0]["args"]), `"required"`) || !strings.Contains(string(got.Items[0]["props"]), `"caption"`) {
		t.Fatalf("entries = %+v", got)
	}
}

// 頭のプラグイン名を付け忘れた名前は、アクションの名前の終わりが 1 つだけに合うなら全文と正しい名前を返し、2 つ以上なら候補の名前だけ、合わなければ unknown
func TestAICatalogEntriesAcceptsANameWithoutThePlugin(t *testing.T) {
	e := newEngine(t)
	e.aiCatalog = json.RawMessage(`{"index":{},"actions":[{"id":"@a/one:go","args":1},{"id":"@b/two:go","args":2},{"id":"@a/one:solo","args":3},{"id":"@a/one:xgo","args":4}],"items":[{"id":"@a/one:solo"}]}`)
	var got struct {
		Actions   []map[string]json.RawMessage `json:"actions"`
		Items     []map[string]json.RawMessage `json:"items"`
		Corrected map[string]string            `json:"corrected"`
		Ambiguous map[string][]string          `json:"ambiguous"`
		Unknown   []string                     `json:"unknown"`
	}
	if err := json.Unmarshal(e.AICatalogEntries([]string{"solo", "go", "o", "nope", "@a/one:go"}), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Actions) != 2 || string(got.Actions[0]["id"]) != `"@a/one:go"` || string(got.Actions[1]["id"]) != `"@a/one:solo"` || len(got.Items) != 0 ||
		got.Corrected["solo"] != "@a/one:solo" || len(got.Corrected) != 1 ||
		strings.Join(got.Ambiguous["go"], ",") != "@a/one:go,@b/two:go" || len(got.Ambiguous) != 1 ||
		strings.Join(got.Unknown, ",") != "nope,o" {
		t.Fatalf("entries = %+v", got)
	}
}

func TestAICatalogVersionChangesWithTheAddedPlugins(t *testing.T) {
	e := newEngine(t)
	version := func() string {
		var v struct {
			Version string `json:"version"`
		}
		_ = json.Unmarshal(e.AICatalogIndex(), &v)
		return v.Version
	}
	before := version()
	if before != version() {
		t.Fatal("the version changes without any plugin change")
	}
	usePlugin(t, e, "../../test/added-plugins/ex2")
	if version() == before {
		t.Fatal("the version did not change after adding a plugin")
	}
}

// AICatalogForTest は AI の一覧の全部（表ごとの全文と目次。本番は目次か、ids の全文だけを返す）
func (e *Engine) AICatalogForTest() json.RawMessage {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.aiCatalog
}

// 止まらない追加プラグインのアクションは、待つ秒数（TimeoutSec）で打ち切って断り、そのあともエンジンは使える。秒数が範囲の外なら bad-args
func TestStopsAnActionThatDoesNotEnd(t *testing.T) {
	e := newEngine(t)
	b := &plugin.Bundle{Dir: "stuck", Manifest: plugin.Manifest{ID: "stuck", Engine: "index.ts"}, Engine: `
var m = globalThis.__matomezuModules["matomezu"];
module.exports.default = {
  id: "stuck",
  messages: { id: "stuck:messages", messages: { "stuck:spin": { en: "Spin" } } },
  actions: [{
    id: "stuck:spin", title: "stuck:spin", aiDescription: "", target: "book", attach: { books: true },
    args: m.z.strictObject({}),
    run: function (b) { while (true) {} }
  }]
}`}
	if _, err := e.UseAllForTest([]*plugin.Bundle{b}); err != nil {
		t.Fatal(err)
	}
	spin := onBook(Input{Actions: []BulkAction{{Action: "stuck:spin", Args: json.RawMessage(`{}`), On: &On{Book: "b1"}, Lang: "en"}}, TimeoutSec: 1}, book)
	start := time.Now()
	out, err := e.Perform(spin)
	if err != nil || out.OK || out.Reason != "refused" || !strings.Contains(out.Detail, "timed out after 1 seconds") {
		t.Fatalf("Perform = %+v, %v", out, err)
	}
	if took := time.Since(start); took > 4*time.Second {
		t.Fatalf("took %v", took)
	}
	if out, err := e.Perform(place("p9")); err != nil || !out.OK {
		t.Fatalf("Perform after a timeout = %+v, %v", out, err)
	}
	for _, sec := range []int{-1, 61} {
		spin.TimeoutSec = sec
		if out, err := e.Perform(spin); err != nil || out.OK || out.Reason != "bad-args" {
			t.Fatalf("TimeoutSec %d: Perform = %+v, %v", sec, out, err)
		}
	}
}

// AI に見せるページ: 背景を持つタイプ（図面）のページは、背景の形の図形の情報を見せず、背景の文字だけを background に入れる。背景を持たないタイプはそのまま
func TestAIPageShowsOnlyTheTextsOfABackground(t *testing.T) {
	e := newEngine(t)
	pageOf := func(typ string) string {
		return `{"kind":"page","id":"p1","type":"` + typ + `","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","slide":[` +
			`{"id":"s1","item":"@matomezu/slide:slide-text","x":1,"y":2,"w":300,"h":40,"props":{"text":"社外秘"}},` +
			`{"id":"s2","item":"@matomezu/slide:slide-ellipse","x":5,"y":6,"w":100,"h":60,"props":{"fill":"#f6c177","stroke":"#286983","width":3}}]}`
	}
	drawing := pageOf("@matomezu/drawing:drawing")
	out, err := e.AIPage(json.RawMessage(drawing))
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Slide      json.RawMessage `json:"slide"`
		Background struct {
			Texts []string `json:"texts"`
		} `json:"background"`
	}
	if err := json.Unmarshal(out, &got); err != nil || got.Slide != nil || len(got.Background.Texts) != 1 || got.Background.Texts[0] != "社外秘" {
		t.Fatalf("AIPage = %s, %v", out, err)
	}
	slide := pageOf("@matomezu/slide-page:slide")
	same, err := e.AIPage(json.RawMessage(slide))
	if err != nil || string(same) != slide {
		t.Fatalf("AIPage of a slide page = %s, %v", same, err)
	}
}

// UseAllForTest は追加プラグインを全部有効にして組み直す（UseFor に設定を渡さない形。ホストは UseFor を使う）
func (e *Engine) UseAllForTest(bundles []*plugin.Bundle) (ids []string, err error) {
	return e.UseFor(bundles, nil)
}

// 参加者のセッションが終わったときに常駐が行うアクションは、アクションの定義が役 runsWhenAIEnds で名乗る（Go は id を知らない）
func TestEndActionsAreNamedByTheDefinition(t *testing.T) {
	e := newEngine(t)
	ids, err := e.EndActions()
	if err != nil || ids == nil || ids.Leave != "@matomezu/base:participant-remove" {
		t.Fatalf("end actions = %+v, %v", ids, err)
	}
}

// ページが 1 枚も無い書庫（書庫ホームだけ）でも、木の決まりを確かめられる
func TestChecksALibraryWithNoPages(t *testing.T) {
	e := newEngine(t)
	home := json.RawMessage(`{"folderRole":"home","id":"library-home","lineup":[]}`)
	line, err := e.CheckLibrary([]json.RawMessage{home}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if line != "" {
		t.Fatalf("a library of the home alone has a warning: %q", line)
	}
}
