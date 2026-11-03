// Package mail sends transactional email through Resend. The key stays on this server.
package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// DefaultURL is Resend's API.
const DefaultURL = "https://api.resend.com"

// Client sends from one address.
type Client struct {
	URL  string
	Key  string
	From string
	HTTP *http.Client
}

// New returns nil without a key or a sender, and callers treat that as email being off.
func New(url, key, from string) *Client {
	if key == "" || from == "" {
		return nil
	}
	if url == "" {
		url = DefaultURL
	}
	return &Client{URL: strings.TrimRight(url, "/"), Key: key, From: from, HTTP: &http.Client{Timeout: 15 * time.Second}}
}

// Message is one email.
type Message struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

// Send delivers a message. Errors name the status only: a body could echo the link it carries.
func (c *Client) Send(ctx context.Context, m Message) error {
	body, err := json.Marshal(map[string]any{"from": c.From, "to": []string{m.To}, "subject": m.Subject, "text": m.Text, "html": m.HTML})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL+"/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("resend: could not reach the service")
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return fmt.Errorf("resend: answered %d", res.StatusCode)
	}
	return nil
}
