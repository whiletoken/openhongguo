package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"sync"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

var (
	globalLogger *zap.Logger
	globalSugar  *zap.SugaredLogger
	globalMu     sync.RWMutex
	fileWriter   *lumberjack.Logger
)

func init() {
	// Initialize default fall-back logger so logging before Init() never panics
	cfg := zap.NewDevelopmentConfig()
	cfg.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	cfg.EncoderConfig.TimeKey = "" // clean dev console
	l, err := cfg.Build()
	if err != nil {
		l = zap.NewNop()
	}
	globalLogger = l
	globalSugar = l.Sugar()
}

// Config specifies logger configuration.
type Config struct {
	Level         string // "debug", "info", "warn", "error"
	LogDir        string // Directory for log files (optional)
	Filename      string // Log filename (default: openhongguo.log)
	EnableConsole bool   // Output to stdout/stderr (default: true)
	EnableFile    bool   // Output to rotating file (default: true if LogDir is set)
	MaxSize       int    // Max size in MB before log rotation (default: 20MB)
	MaxBackups    int    // Max number of old log files retained (default: 5)
	MaxAge        int    // Max days to retain old log files (default: 14)
	Compress      bool   // Compress rotated log files with gzip (default: true)
}

// DefaultConfig provides recommended default logging settings.
func DefaultConfig() Config {
	return Config{
		Level:         "info",
		Filename:      "openhongguo.log",
		EnableConsole: true,
		EnableFile:    false,
		MaxSize:       20,
		MaxBackups:    5,
		MaxAge:        14,
		Compress:      true,
	}
}

// parseLevel converts string level into zapcore.Level.
func parseLevel(lvl string) zapcore.Level {
	switch strings.ToLower(strings.TrimSpace(lvl)) {
	case "debug":
		return zapcore.DebugLevel
	case "info":
		return zapcore.InfoLevel
	case "warn", "warning":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}

// Init initializes the global Zap logger with console and optional rolling file sinks.
func Init(cfg Config) (*zap.Logger, error) {
	globalMu.Lock()
	defer globalMu.Unlock()

	level := parseLevel(cfg.Level)
	var cores []zapcore.Core

	// 1. Console Core
	if cfg.EnableConsole {
		consoleEncoderConfig := zap.NewDevelopmentEncoderConfig()
		consoleEncoderConfig.EncodeTime = zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05.000")
		consoleEncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
		consoleEncoderConfig.EncodeCaller = zapcore.ShortCallerEncoder
		consoleEncoderConfig.EncodeDuration = zapcore.StringDurationEncoder

		consoleCore := zapcore.NewCore(
			zapcore.NewConsoleEncoder(consoleEncoderConfig),
			zapcore.AddSync(os.Stdout),
			level,
		)
		cores = append(cores, consoleCore)
	}

	// 2. Rolling File Core (Lumberjack)
	if cfg.EnableFile && cfg.LogDir != "" {
		if err := os.MkdirAll(cfg.LogDir, 0755); err != nil {
			return nil, fmt.Errorf("create log directory %q: %w", cfg.LogDir, err)
		}

		filename := cfg.Filename
		if filename == "" {
			filename = "openhongguo.log"
		}
		logFilePath := filepath.Join(cfg.LogDir, filename)

		maxSize := cfg.MaxSize
		if maxSize <= 0 {
			maxSize = 20
		}
		maxBackups := cfg.MaxBackups
		if maxBackups <= 0 {
			maxBackups = 5
		}
		maxAge := cfg.MaxAge
		if maxAge <= 0 {
			maxAge = 14
		}

		fileWriter = &lumberjack.Logger{
			Filename:   logFilePath,
			MaxSize:    maxSize,
			MaxBackups: maxBackups,
			MaxAge:     maxAge,
			Compress:   cfg.Compress,
			LocalTime:  true,
		}

		fileEncoderConfig := zap.NewProductionEncoderConfig()
		fileEncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
		fileEncoderConfig.EncodeLevel = zapcore.CapitalLevelEncoder
		fileEncoderConfig.EncodeCaller = zapcore.ShortCallerEncoder
		fileEncoderConfig.EncodeDuration = zapcore.MillisDurationEncoder

		fileCore := zapcore.NewCore(
			zapcore.NewJSONEncoder(fileEncoderConfig),
			zapcore.AddSync(fileWriter),
			level,
		)
		cores = append(cores, fileCore)
	}

	// Fallback to nop if no cores enabled
	var teeCore zapcore.Core
	if len(cores) == 0 {
		teeCore = zapcore.NewNopCore()
	} else if len(cores) == 1 {
		teeCore = cores[0]
	} else {
		teeCore = zapcore.NewTee(cores...)
	}

	newLogger := zap.New(teeCore, zap.AddCaller(), zap.AddCallerSkip(1))
	globalLogger = newLogger
	globalSugar = newLogger.Sugar()

	return globalLogger, nil
}

// L returns the underlying *zap.Logger.
func L() *zap.Logger {
	globalMu.RLock()
	defer globalMu.RUnlock()
	return globalLogger
}

// S returns the underlying *zap.SugaredLogger.
func S() *zap.SugaredLogger {
	globalMu.RLock()
	defer globalMu.RUnlock()
	return globalSugar
}

// Info logs a message at InfoLevel.
func Info(msg string, fields ...zap.Field) {
	L().Info(msg, fields...)
}

// Debug logs a message at DebugLevel.
func Debug(msg string, fields ...zap.Field) {
	L().Debug(msg, fields...)
}

// Warn logs a message at WarnLevel.
func Warn(msg string, fields ...zap.Field) {
	L().Warn(msg, fields...)
}

// Error logs a message at ErrorLevel.
func Error(msg string, fields ...zap.Field) {
	L().Error(msg, fields...)
}

// Infof formats and logs at InfoLevel.
func Infof(template string, args ...any) {
	S().Infof(template, args...)
}

// Debugf formats and logs at DebugLevel.
func Debugf(template string, args ...any) {
	S().Debugf(template, args...)
}

// Warnf formats and logs at WarnLevel.
func Warnf(template string, args ...any) {
	S().Warnf(template, args...)
}

// Errorf formats and logs at ErrorLevel.
func Errorf(template string, args ...any) {
	S().Errorf(template, args...)
}

// Sync flushes any buffered log entries.
func Sync() error {
	globalMu.RLock()
	defer globalMu.RUnlock()
	if globalLogger != nil {
		_ = globalLogger.Sync()
	}
	if fileWriter != nil {
		_ = fileWriter.Close()
	}
	return nil
}

// SafeGo executes a background function in a new goroutine with automatic panic recovery and logging.
// This prevents background goroutine panics from crashing the entire process.
func SafeGo(fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				stack := string(debug.Stack())
				Error("panic recovered in background goroutine",
					zap.Any("panic", r),
					zap.String("stack", stack),
				)
			}
		}()
		fn()
	}()
}

// SafeGoNamed executes a named background goroutine with automatic panic recovery.
func SafeGoNamed(name string, fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				stack := string(debug.Stack())
				Error(fmt.Sprintf("panic recovered in background task [%s]", name),
					zap.String("task_name", name),
					zap.Any("panic", r),
					zap.String("stack", stack),
				)
			}
		}()
		fn()
	}()
}
