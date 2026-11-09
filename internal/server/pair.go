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

// 画面とのペア: 画面からの入口（screen で包んだ物）は、ペアを組んだブラウザの cookie の鍵がある頼みだけを通す。
// 鍵はブラウザの cookie にだけ置き、常駐は鍵のハッシュだけを持つ。ペアのコードは、常駐がブラウザを開くときの URL にだけ載せ、どの返事にも載せない。
// AI はコードも鍵も受け取れず、自分では画面の頼みを通せない

const (
	// pairCodeTTL はペアのコードが使える長さ
	pairCodeTTL = 5 * time.Minute
	// maxPairKeys は持つ鍵の数の上限（最後に使った順に残す）
	maxPairKeys = 20
	// pairCookieAge は cookie の有効期間
	pairCookieAge = 400 * 24 * time.Hour
	// pairUsedEvery は、使った時刻を保存し直す間隔（頼みのたびには書かない）
	pairUsedEvery = 10 * time.Minute
)

// PairKey はペアを組んだブラウザの鍵のハッシュと、最後に使った時刻
type PairKey struct {
	Hash string    `json:"hash"`
	Used time.Time `json:"used"`
}

// Pairing は画面とのペア（コードと鍵のハッシュ）。save は鍵の並びが変わったときの保存（無ければ保存しない）
type Pairing struct {
	mu    sync.Mutex
	codes map[string]time.Time // コード → 期限
	keys  []PairKey
	saved map[string]time.Time // ハッシュ → 保存した使った時刻
	save  func([]PairKey) error
	now   func() time.Time
}

// NewPairing は、保存してあった鍵 keys を持つペアを作る
func NewPairing(keys []PairKey, save func([]PairKey) error) *Pairing {
	p := &Pairing{codes: map[string]time.Time{}, keys: append([]PairKey(nil), keys...), saved: map[string]time.Time{}, save: save, now: time.Now}
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

// NewCode は使い捨てのペアのコードを作る（期限の過ぎたコードは捨てる）
func (p *Pairing) NewCode() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := p.now()
	for c, exp := range p.codes {
		if !exp.After(now) {
			delete(p.codes, c)
		}
	}
	code := randomHex()
	p.codes[code] = now.Add(pairCodeTTL)
	return code
}

// DropCode はコードを使えなくする（ブラウザを開けなかったとき）
func (p *Pairing) DropCode(code string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.codes, code)
}

// Redeem はコードを 1 度だけ受け付け、新しい鍵を作って返す。コードが無い・使った・期限切れなら false
func (p *Pairing) Redeem(code string) (secret string, ok bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := p.now()
	exp, found := p.codes[code]
	delete(p.codes, code)
	if !found || !exp.After(now) {
		return "", false
	}
	secret = randomHex()
	p.keys = append(p.keys, PairKey{Hash: hashOf(secret), Used: now})
	p.trim()
	p.persist()
	return secret, true
}

// trim は鍵を、最後に使った順に maxPairKeys 件へ絞る
func (p *Pairing) trim() {
	if len(p.keys) <= maxPairKeys {
		return
	}
	sort.SliceStable(p.keys, func(i, j int) bool { return p.keys[i].Used.After(p.keys[j].Used) })
	p.keys = p.keys[:maxPairKeys]
}

func (p *Pairing) persist() {
	if p.save == nil {
		return
	}
	if p.save(append([]PairKey(nil), p.keys...)) == nil {
		for _, k := range p.keys {
			p.saved[k.Hash] = k.Used
		}
	}
}

// Check は鍵がペア済みのものか（合えば最後に使った時刻を更新し、しばらく経っていれば保存し直す）
func (p *Pairing) Check(secret string) bool {
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
			if now.Sub(p.saved[h]) >= pairUsedEvery {
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

// paired は、ペアを組んだブラウザの頼みだけを通す
func (o Options) paired(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(cookieName(r)); err != nil || !o.Pair.Check(c.Value) {
			http.Error(w, "pair-required", http.StatusForbidden)
			return
		}
		h(w, r)
	}
}

// screen は「画面から」の入口を包む（この常駐の画面からの頼みで、ペアを組んだブラウザから）
func (o Options) screen(h http.HandlerFunc) http.Handler {
	return sameOrigin(o.paired(h))
}

// pair は GET /pair?code=…。コードを受け付けて鍵を cookie に置き、画面へ戻す
func (o Options) pair(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	secret, ok := o.Pair.Redeem(r.URL.Query().Get("code"))
	if !ok {
		http.Error(w, "the pairing code is not valid", http.StatusForbidden)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: cookieName(r), Value: secret, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode,
		MaxAge: int(pairCookieAge / time.Second),
	})
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

// openScreen は、ペアのコード付きの URL でブラウザを開く。開けなければコードを捨てて理由を返す
func (o Options) openScreen() error {
	code := o.Pair.NewCode()
	if err := o.Open(o.URL + "pair?code=" + url.QueryEscape(code)); err != nil {
		o.Pair.DropCode(code)
		return err
	}
	return nil
}

// openAPI は POST /api/open（合言葉つき）。ペアのコード付きでブラウザを開く（コードは返さない）
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
