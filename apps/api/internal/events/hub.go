// Package events fans every delta out to the clients listening on the server-sent events stream,
// so the console, the seller app and the storefront see each other's changes as they happen.
package events

import (
	"encoding/json"
	"slices"
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
	// Keep, when set, decides row by row. It sees customer rows before the rest of a change, and
	// runs under the hub's lock, so it may keep state of its own.
	Keep func(collection string, data json.RawMessage) bool
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
	collections := make([]string, 0, len(c.Upserts))
	for collection := range c.Upserts {
		collections = append(collections, collection)
	}
	// Customers first, so a Keep that tracks assignments sees them before the orders of the same change.
	if i := slices.Index(collections, "customers"); i > 0 {
		collections[0], collections[i] = collections[i], collections[0]
	}
	for _, collection := range collections {
		if s.Collections != nil && !s.Collections[collection] {
			continue
		}
		for _, r := range c.Upserts[collection] {
			if s.tenant(r.TenantID) && (s.Keep == nil || s.Keep(collection, r.Data)) {
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
	// forward, when set, also hands every published change to other processes.
	forward func(Change)
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

// Forward makes Publish also call fn with each change. Set it before the hub is in use.
func (h *Hub) Forward(fn func(Change)) { h.forward = fn }

// Publish delivers the change here and, with Forward set, to other processes.
func (h *Hub) Publish(c Change) {
	h.Deliver(c)
	if h.forward != nil {
		h.forward(c)
	}
}

// Deliver sends the change to every subscriber in this process whose scope keeps part of it. Slow
// readers drop events rather than block the writer; they refetch on reconnect.
func (h *Hub) Deliver(c Change) {
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
