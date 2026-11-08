package webserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRecoveryMiddleware(t *testing.T) {
	panickingHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("deliberate nil pointer dereference or crash")
	})

	recoveredHandler := RecoveryMiddleware(panickingHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/test/panic", nil)
	w := httptest.NewRecorder()

	// This must not panic
	recoveredHandler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("expected 500 Internal Server Error, got %d", resp.StatusCode)
	}

	var data map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatalf("failed to decode json response: %v", err)
	}

	if data["error"] != "Internal Server Error" {
		t.Errorf("expected error field 'Internal Server Error', got %v", data["error"])
	}
	if data["code"] != float64(500) {
		t.Errorf("expected code 500, got %v", data["code"])
	}
}

func TestLoggingMiddlewareRequestID(t *testing.T) {
	normalHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := GetRequestID(r.Context())
		if reqID == "" {
			t.Error("expected non-empty reqID in context")
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	loggedHandler := LoggingMiddleware(normalHandler)

	// 1. Without incoming X-Request-ID (should auto generate)
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()
	loggedHandler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.Header.Get("X-Request-ID") == "" {
		t.Error("expected X-Request-ID in response header")
	}

	// 2. With incoming X-Request-ID (should preserve)
	req2 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req2.Header.Set("X-Request-ID", "custom-trace-12345")
	w2 := httptest.NewRecorder()
	loggedHandler.ServeHTTP(w2, req2)

	resp2 := w2.Result()
	if resp2.Header.Get("X-Request-ID") != "custom-trace-12345" {
		t.Errorf("expected custom-trace-12345, got %s", resp2.Header.Get("X-Request-ID"))
	}
}
