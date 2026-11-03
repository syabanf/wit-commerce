// Package events fans every delta out to the clients listening on the server-sent events stream,
// so the console, the seller app and the storefront see each other's changes as they happen.
package events

import (
	"encoding/json"
	"sync"
)

// Row is one changed document with the tenant it belongs to, for scoping.
type Row struct {
	TenantID string
	Data     json.RawMessage
}

// Change is a delta ready to broadcast: rows per collection and removed ids per collection.
type Change struct {
	Upserts map[string][]Row
	Removes map[string][]Removed
}

// Removed is an id with the tenant it belonged to.
type Removed struct {
	TenantID string
	ID       string
}

// Scope says what a subscriber may see.
type Scope struct {
	// Tenants the subscriber works in; nil means every tenant.
	TenantIDs []string
	// Collections the subscriber may receive; nil means all.
	Collections map[string]bool
}

func (s Scope) tenant(id string) bool {
	if s.TenantIDs == nil {
		return true
	}
	for _, t := range s.TenantIDs {
		if t == id || id == "" {
			return true
		}
	}
	return false
}

// Filter keeps what the scope may see; ok is false when nothing is left.
func (s Scope) Filter(c Change) (map[string]any, bool) {
	upserts := map[string][]json.RawMessage{}
	removes := map[string][]string{}
	for collection, rows := range c.Upserts {
		if s.Collections != nil && !s.Collections[collection] {
			continue
		}
		for _, r := range rows {
			if s.tenant(r.TenantID) {
				upserts[collection] = append(upserts[collection], r.Data)
			}
		}
	}
	for collection, ids := range c.Removes {
		if s.Collections != nil && !s.Collections[collection] {
			continue
		}
		for _, r := range ids {
			if s.tenant(r.TenantID) {
				removes[collection] = append(removes[collection], r.ID)
			}
		}
	}
	if len(upserts) == 0 && len(removes) == 0 {
		return nil, false
	}
	return map[string]any{"upserts": upserts, "removes": removes}, true
}

type subscriber struct {
	scope Scope
	ch    chan []byte
}

// Hub holds the subscribers.
type Hub struct {
	mu   sync.Mutex
	subs map[*subscriber]struct{}
}

// New makes an empty hub.
func New() *Hub { return &Hub{subs: map[*subscriber]struct{}{}} }

// Subscribe returns a channel of encoded deltas and a function to leave.
func (h *Hub) Subscribe(scope Scope) (<-chan []byte, func()) {
	s := &subscriber{scope: scope, ch: make(chan []byte, 32)}
	h.mu.Lock()
	h.subs[s] = struct{}{}
	h.mu.Unlock()
	return s.ch, func() {
		h.mu.Lock()
		delete(h.subs, s)
		h.mu.Unlock()
	}
}

// Publish sends the change to every subscriber whose scope keeps part of it. Slow readers drop
// events rather than block the writer; they refetch on reconnect.
func (h *Hub) Publish(c Change) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for s := range h.subs {
		payload, ok := s.scope.Filter(c)
		if !ok {
			continue
		}
		data, err := json.Marshal(payload)
		if err != nil {
			continue
		}
		select {
		case s.ch <- data:
		default:
		}
	}
}

// Count is the number of open streams, for the health endpoint.
func (h *Hub) Count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subs)
}
