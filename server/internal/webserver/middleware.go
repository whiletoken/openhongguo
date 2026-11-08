package webserver

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/beilunyang/openhongguo/server/internal/logger"
	"go.uber.org/zap"
)

type contextKey string

const requestIDKey contextKey = "ohg_request_id"

// GetRequestID returns the request ID associated with the context, if any.
func GetRequestID(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if id, ok := ctx.Value(requestIDKey).(string); ok {
		return id
	}
	return ""
}

// generateRequestID produces a lightweight unique request identifier.
func generateRequestID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("req-%x", time.Now().UnixNano())
	}
	return "req-" + hex.EncodeToString(buf)
}

// responseWriterInterceptor wraps http.ResponseWriter to capture status and bytes.
type responseWriterInterceptor struct {
	http.ResponseWriter
	statusCode   int
	bytesWritten int64
	wroteHeader  bool
}

func (w *responseWriterInterceptor) WriteHeader(code int) {
	if !w.wroteHeader {
		w.statusCode = code
		w.wroteHeader = true
		w.ResponseWriter.WriteHeader(code)
	}
}

func (w *responseWriterInterceptor) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytesWritten += int64(n)
	return n, err
}

// Unwrap supports http.ResponseController unwrapping.
func (w *responseWriterInterceptor) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// LoggingMiddleware records structured HTTP access logs and attaches X-Request-ID.
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			reqID = generateRequestID()
		}

		// Inject into context & response header
		ctx := context.WithValue(r.Context(), requestIDKey, reqID)
		r = r.WithContext(ctx)
		w.Header().Set("X-Request-ID", reqID)

		interceptor := &responseWriterInterceptor{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}

		next.ServeHTTP(interceptor, r)

		latency := time.Since(start)
		isAPI := strings.HasPrefix(r.URL.Path, "/api/")

		fields := []zap.Field{
			zap.String("req_id", reqID),
			zap.String("method", r.Method),
			zap.String("path", r.URL.Path),
			zap.String("query", r.URL.RawQuery),
			zap.Int("status", interceptor.statusCode),
			zap.Int64("bytes", interceptor.bytesWritten),
			zap.Duration("latency", latency),
			zap.String("client_ip", r.RemoteAddr),
			zap.String("user_agent", r.UserAgent()),
		}

		if !isAPI {
			// Static assets log at debug level to avoid log spam
			logger.Debug("HTTP static asset request", fields...)
			return
		}

		// API requests
		if interceptor.statusCode >= 500 {
			logger.Error("HTTP API error", fields...)
		} else if interceptor.statusCode >= 400 {
			logger.Warn("HTTP API client warning", fields...)
		} else {
			logger.Info("HTTP API access", fields...)
		}
	})
}

// RecoveryMiddleware recovers from any HTTP handler panic, logs stack traces, and returns a 500 JSON response.
func RecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				reqID := GetRequestID(r.Context())
				stack := string(debug.Stack())

				logger.Error("HTTP handler panic recovered",
					zap.String("req_id", reqID),
					zap.String("method", r.Method),
					zap.String("path", r.URL.Path),
					zap.String("client_ip", r.RemoteAddr),
					zap.Any("panic", rec),
					zap.String("stack", stack),
				)

				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"code":       http.StatusInternalServerError,
					"error":      "Internal Server Error",
					"message":    fmt.Sprintf("服务器发生未捕获异常: %v", rec),
					"request_id": reqID,
				})
			}
		}()

		next.ServeHTTP(w, r)
	})
}
