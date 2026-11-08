package webserver

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/beilunyang/openhongguo/server/sdk"
)

// Fallback DNS servers to bypass adblock sinkholes (e.g., 0.0.0.0 for log5-applog-lq.fqnovel.com)
var publicDNSServers = []string{
	"223.5.5.5:53",   // AliDNS
	"119.29.29.29:53", // DNSPod / Tencent
	"114.114.114.114:53",
}

// SmartTransport provides robust HTTP transport with anti-sinkhole DNS fallback.
type SmartTransport struct {
	client   *http.Client
	logger   sdk.Logger
	dnsMu    sync.RWMutex
	dnsCache map[string][]net.IP
}

// NewSmartTransport creates a Transport with intelligent DNS fallback.
func NewSmartTransport() *SmartTransport {
	st := &SmartTransport{
		dnsCache: make(map[string][]net.IP),
	}

	dialer := &net.Dialer{
		Timeout:   15 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	customDialContext := func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return dialer.DialContext(ctx, network, addr)
		}

		// Check if host is already an IP address
		if ip := net.ParseIP(host); ip != nil {
			return dialer.DialContext(ctx, network, addr)
		}

		// 1. Try system resolver first
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
		useFallback := false
		if err != nil || len(ips) == 0 {
			useFallback = true
		} else {
			// Check if any returned IP is 0.0.0.0 or loopback (DNS adblock sinkhole)
			for _, ip := range ips {
				if ip.IsUnspecified() || ip.IsLoopback() {
					useFallback = true
					break
				}
			}
		}

		// 2. If blocked by adblock sinkhole, resolve via public DNS
		if useFallback {
			st.dnsMu.RLock()
			cachedIPs := st.dnsCache[host]
			st.dnsMu.RUnlock()

			if len(cachedIPs) > 0 {
				ips = cachedIPs
			} else {
				ips = st.lookupPublicDNS(ctx, host)
				if len(ips) > 0 {
					st.dnsMu.Lock()
					st.dnsCache[host] = ips
					st.dnsMu.Unlock()
				}
			}

			for _, ip := range ips {
				if !ip.IsUnspecified() && !ip.IsLoopback() {
					target := net.JoinHostPort(ip.String(), port)
					conn, dialErr := dialer.DialContext(ctx, network, target)
					if dialErr == nil {
						return conn, nil
					}
				}
			}
		}

		return dialer.DialContext(ctx, network, addr)
	}

	tr := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           customDialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
	}

	st.client = &http.Client{
		Transport: tr,
		Timeout:   30 * time.Second,
	}

	return st
}

func (st *SmartTransport) lookupPublicDNS(ctx context.Context, host string) []net.IP {
	for _, dnsServer := range publicDNSServers {
		resolver := &net.Resolver{
			PreferGo: true,
			Dial: func(dialCtx context.Context, network, address string) (net.Conn, error) {
				d := net.Dialer{Timeout: 3 * time.Second}
				return d.DialContext(dialCtx, "udp", dnsServer)
			},
		}
		cLookup, cancel := context.WithTimeout(ctx, 4*time.Second)
		ips, err := resolver.LookupIP(cLookup, "ip", host)
		cancel()
		if err == nil && len(ips) > 0 {
			var valid []net.IP
			for _, ip := range ips {
				if !ip.IsUnspecified() && !ip.IsLoopback() {
					valid = append(valid, ip)
				}
			}
			if len(valid) > 0 {
				return valid
			}
		}
	}
	return nil
}

// Do executes an anonymous HTTP request for the SDK.
func (st *SmartTransport) Do(ctx context.Context, req *sdk.Request) (*sdk.Response, error) {
	if req == nil {
		return nil, errors.New("smarttransport: nil request")
	}

	for name, value := range req.Headers {
		if strings.EqualFold(name, "Authorization") || (strings.EqualFold(name, "Cookie") && !guestCookieAllowed(value)) {
			return nil, fmt.Errorf("%w: credential header refused", sdk.ErrAuthenticationRequired)
		}
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}

	hreq, err := http.NewRequestWithContext(ctx, method, req.URL, bytes.NewReader(req.Body))
	if err != nil {
		return nil, err
	}

	for k, v := range req.Headers {
		hreq.Header.Set(k, v)
	}

	resp, err := st.client.Do(hreq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}

	headers := map[string]string{}
	for k, values := range resp.Header {
		if strings.EqualFold(k, "Set-Cookie") || strings.EqualFold(k, "Cookie") {
			continue
		}
		if len(values) > 0 {
			headers[k] = values[0]
		}
	}

	cookies := map[string]string{}
	for _, cookie := range resp.Cookies() {
		if cookie.Name != "" {
			cookies[cookie.Name] = cookie.Value
		}
	}

	return &sdk.Response{
		StatusCode: resp.StatusCode,
		Headers:    headers,
		Body:       body,
		Cookies:    cookies,
	}, nil
}

func guestCookieAllowed(value string) bool {
	lower := strings.ToLower(value)
	if strings.Contains(lower, "session") || strings.Contains(lower, "odin_tt") {
		return false
	}
	return strings.Contains(value, "passport_csrf_token=;") &&
		strings.Contains(value, "install_id=") &&
		strings.Contains(value, "ttreq=")
}
