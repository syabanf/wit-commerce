// Package ai calls a model on Ollama. The key stays on this server; browsers never see it.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// DefaultModel answers in about a second, quick enough for a chat.
const DefaultModel = "deepseek-v4.1-flash"

// DefaultURL is Ollama's hosted API.
const DefaultURL = "https://ollama.com"

// Client talks to one model.
type Client struct {
	URL   string
	Key   string
	Model string
	HTTP  *http.Client
}

// New returns nil without a key, and callers treat that as AI being off.
func New(url, key, model string) *Client {
	if key == "" {
		return nil
	}
	if url == "" {
		url = DefaultURL
	}
	if model == "" {
		model = DefaultModel
	}
	return &Client{URL: strings.TrimRight(url, "/"), Key: key, Model: model, HTTP: &http.Client{Timeout: 20 * time.Second}}
}

// Message is one turn of a conversation.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// JSON sends the conversation and decodes the model's JSON answer into out.
func (c *Client) JSON(ctx context.Context, messages []Message, out any) error {
	body, err := json.Marshal(map[string]any{
		"model": c.Model, "stream": false, "think": false, "format": "json",
		"options": map[string]any{"temperature": 0.2}, "messages": messages,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("ollama: could not reach the model")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("ollama: answered %d", res.StatusCode)
	}
	var answer struct {
		Message Message `json:"message"`
	}
	if err := json.NewDecoder(res.Body).Decode(&answer); err != nil {
		return fmt.Errorf("ollama: unreadable answer")
	}
	if err := json.Unmarshal([]byte(answer.Message.Content), out); err != nil {
		return fmt.Errorf("ollama: the model did not answer in JSON")
	}
	return nil
}
