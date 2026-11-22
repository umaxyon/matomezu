package engine

import (
	"encoding/json"
	"fmt"
)

// UpdateCheck は、常駐が新しい版を自分で確かめるか（利用者の設定 settings の項目で決まる）
func (e *Engine) UpdateCheck(settings json.RawMessage) (on bool, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return e.updateCheck(string(settings)), nil
}
