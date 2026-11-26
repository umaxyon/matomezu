package server

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net"
	"net/http"
	"net/url"
	"sort"
	"sync"
	"time"
)

// 画面 cookie: 画面からの入口（screen で包んだ物）は、画面 cookie を持つブラウザの cookie の鍵がある頼みだけを通す。
// 鍵はブラウザの cookie にだけ置き、常駐は鍵のハッシュだけを持つ。cookie のコードは、常駐がブラウザを開くときの URL にだけ載せ、どの返事にも載せない。
// AI はコードも鍵も受け取れず、自分では画面の頼みを通せない

const (
	// cookieCodeTTL はcookie のコードが使える長さ
	cookieCodeTTL = 5 * time.Minute
	// maxCookieKeys は持つ鍵の数の上限（最後に使った順に残す）
	maxCookieKeys = 20
	// cookieAge は cookie の有効期間
	cookieAge = 400 * 24 * time.Hour
	// cookieUsedEvery は、使った時刻を保存し直す間隔（頼みのたびには書かない）
	cookieUsedEvery = 10 * time.Minute
)

// CookieKey は画面 cookie を持つブラウザの鍵のハッシュと、最後に使った時刻
type CookieKey struct {
	Hash string    `json:"hash"`
	Used time.Time `json:"used"`
}

// ScreenCookies は画面 cookie（コードと鍵のハッシュ）。save は鍵の並びが変わったときの保存（無ければ保存しない）
type ScreenCookies struct {
	mu    sync.Mutex
	codes map[string]time.Time // コード → 期限
	keys  []CookieKey
	saved map[string]time.Time // ハッシュ → 保存した使った時刻
	save  func([]CookieKey) error
	now   func() time.Time
}

// NewScreenCookies は、保存してあった鍵 keys を持つ画面 cookie を作る
func NewScreenCookies(keys []CookieKey, save func([]CookieKey) error) *ScreenCookies {
	p := &ScreenCookies{codes: map[string]time.Time{}, keys: append([]CookieKey(nil), keys...), saved: map[string]time.Time{}, save: save, now: time.Now}
	for _, k := range keys {
		p.saved[k.Hash] = k.Used
	}
	return p
}

func randomHex() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err) // 乱数が読めないなら、鍵を作れない
	}
	return hex.EncodeToString(b)
}

func hashOf(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// NewCode は使い捨てのcookie のコードを作る（期限の過ぎたコードは捨てる）
func (p *ScreenCookies) NewCode() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := p.now()
	for c, exp := range p.codes {
		if !exp.After(now) {
			delete(p.codes, c)
		}
	}
	code := randomHex()
	p.codes[code] = now.Add(cookieCodeTTL)
	return code
}

// DropCode はコードを使えなくする（ブラウザを開けなかったとき）
func (p *ScreenCookies) DropCode(code string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.codes, code)
}

// Redeem はコードを 1 度だけ受け付け、新しい鍵を作って返す。コードが無い・使った・期限切れなら false
func (p *ScreenCookies) Redeem(code string) (secret string, ok bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := p.now()
	exp, found := p.codes[code]
	delete(p.codes, code)
	if !found || !exp.After(now) {
		return "", false
	}
	secret = randomHex()
	p.keys = append(p.keys, CookieKey{Hash: hashOf(secret), Used: now})
	p.trim()
	p.persist()
	return secret, true
}

// trim は鍵を、最後に使った順に maxCookieKeys 件へ絞る
func (p *ScreenCookies) trim() {
	if len(p.keys) <= maxCookieKeys {
		return
	}
	sort.SliceStable(p.keys, func(i, j int) bool { return p.keys[i].Used.After(p.keys[j].Used) })
	p.keys = p.keys[:maxCookieKeys]
}

func (p *ScreenCookies) persist() {
	if p.save == nil {
		return
	}
	if p.save(append([]CookieKey(nil), p.keys...)) == nil {
		for _, k := range p.keys {
			p.saved[k.Hash] = k.Used
		}
	}
}

// Check は鍵が画面 cookie の鍵か（合えば最後に使った時刻を更新し、しばらく経っていれば保存し直す）
func (p *ScreenCookies) Check(secret string) bool {
	if secret == "" {
		return false
	}
	h := hashOf(secret)
	p.mu.Lock()
	defer p.mu.Unlock()
	now := p.now()
	for i := range p.keys {
		if subtle.ConstantTimeCompare([]byte(p.keys[i].Hash), []byte(h)) == 1 {
			p.keys[i].Used = now
			if now.Sub(p.saved[h]) >= cookieUsedEvery {
				p.persist()
			}
			return true
		}
	}
	return false
}

// cookieName は常駐ごとの cookie の名前（cookie は port で分かれないので、port を入れて、同じ名前の別の常駐の物とぶつからないようにする）
func cookieName(r *http.Request) string {
	_, port, err := net.SplitHostPort(r.Host)
	if err != nil {
		port = "0"
	}
	return "matomezu-" + port
}

// withCookie は、画面 cookie を持つブラウザの頼みだけを通す
func (o Options) withCookie(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(cookieName(r)); err != nil || !o.Cookies.Check(c.Value) {
			http.Error(w, "cookie-required", http.StatusForbidden)
			return
		}
		h(w, r)
	}
}

// screen は「画面から」の入口を包む（この常駐の画面からの頼みで、画面 cookie を持つブラウザから）
func (o Options) screen(h http.HandlerFunc) http.Handler {
	return sameOrigin(o.withCookie(h))
}

// screenBytes は screen の、本文にバイト列（application/octet-stream）を受ける物
func (o Options) screenBytes(h http.HandlerFunc) http.Handler {
	return sameOriginWith("application/octet-stream", o.withCookie(h))
}

// giveCookie は GET /cookie?code=…。コードを受け付けて鍵を cookie に置き、画面へ戻す
func (o Options) giveCookie(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	secret, ok := o.Cookies.Redeem(r.URL.Query().Get("code"))
	if !ok {
		http.Error(w, "the cookie code is not valid", http.StatusForbidden)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: cookieName(r), Value: secret, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode,
		MaxAge: int(cookieAge / time.Second),
	})
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

// openScreen は、cookie のコード付きの URL でブラウザを開く。開けなければコードを捨てて理由を返す
func (o Options) openScreen() error {
	code := o.Cookies.NewCode()
	if err := o.Open(o.URL + "cookie?code=" + url.QueryEscape(code)); err != nil {
		o.Cookies.DropCode(code)
		return err
	}
	return nil
}

// openAPI は POST /api/open（合言葉つき）。cookie のコード付きでブラウザを開く（コードは返さない）
func (o Options) openAPI(w http.ResponseWriter, _ *http.Request) {
	if o.Open == nil {
		writeJSON(w, map[string]any{"ok": false, "reason": "no-browser"})
		return
	}
	if err := o.openScreen(); err != nil {
		writeJSON(w, map[string]any{"ok": false, "reason": "no-browser", "detail": err.Error(), "url": o.URL})
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}
