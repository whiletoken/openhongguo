package webserver

import (
	"encoding/json"
	"net/http"

	"github.com/beilunyang/openhongguo/server/internal/logger"
	"go.uber.org/zap"
)

// ErrorResponse represents a standardized API error response.
type ErrorResponse struct {
	Code      int    `json:"code"`
	Error     string `json:"error"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

// jsonResponse writes JSON data with the given status code.
func jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// jsonError writes a standardized JSON error message and logs appropriately.
func jsonError(w http.ResponseWriter, status int, msg string) {
	if status >= 500 {
		logger.Error("API server error response",
			zap.Int("status", status),
			zap.String("error", msg),
		)
	} else if status >= 400 {
		logger.Warn("API client error response",
			zap.Int("status", status),
			zap.String("error", msg),
		)
	}

	jsonResponse(w, status, map[string]any{
		"code":    status,
		"error":   msg,
		"message": msg,
	})
}
