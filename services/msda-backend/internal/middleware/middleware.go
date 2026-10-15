package middleware

import (
	"crypto/sha256"
	"crypto/subtle"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ── Logger ────────────────────────────────────────────────────────────────────

func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Printf("[%d] %s %s  %v",
			c.Writer.Status(),
			c.Request.Method,
			c.Request.URL.Path,
			time.Since(start),
		)
	}
}

// ── CORS ──────────────────────────────────────────────────────────────────────

// CORS hanya aktif bila ALLOWED_ORIGINS diisi. Browser TIDAK memanggil backend
// langsung (semua lewat proxy Next.js di dashboard), jadi default-nya tidak ada
// header CORS sama sekali — bukan wildcard.
func CORS() gin.HandlerFunc {
	allowedOrigins := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	return func(c *gin.Context) {
<<<<<<< HEAD
		c.Header("Access-Control-Allow-Origin", allowedOrigins)
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-MSDA-Token")
		c.Header("Access-Control-Allow-Credentials", "true")

=======
		if allowedOrigins != "" {
			c.Header("Access-Control-Allow-Origin", allowedOrigins)
			c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type,X-MSDA-Token,X-Internal-Token")
			c.Header("Vary", "Origin")
		}
>>>>>>> 478bbba (modified backend for update msda)
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// ── Token comparison ──────────────────────────────────────────────────────────

// secureEqual membandingkan dua string dalam waktu konstan. Keduanya di-hash dulu
// supaya panjang token pun tidak bocor lewat waktu respons.
func secureEqual(a, b string) bool {
	ha := sha256.Sum256([]byte(a))
	hb := sha256.Sum256([]byte(b))
	return subtle.ConstantTimeCompare(ha[:], hb[:]) == 1
}

<<<<<<< HEAD
func jwtSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "msda-secret-change-me"
	}
	return []byte(s)
}

func GenerateToken(adminID, username, role string) (string, error) {
	claims := Claims{
		AdminID:  adminID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret())
}

func ParseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return jwtSecret(), nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, jwt.ErrTokenInvalidClaims
}

// RequireAuth validates JWT Bearer token from Authorization header.
func RequireAuth() gin.HandlerFunc {
=======
// requireSharedToken membuat middleware yang menolak request bila header tidak
// cocok dengan nilai env. GAGAL-TERTUTUP: bila env kosong, SEMUA request ditolak
// (503), bukan dibiarkan lewat.
func requireSharedToken(envKey, header string) gin.HandlerFunc {
	expected := os.Getenv(envKey)
>>>>>>> 478bbba (modified backend for update msda)
	return func(c *gin.Context) {
		if expected == "" {
			log.Printf("[AUTH] %s is not configured; rejecting request to %s", envKey, c.Request.URL.Path)
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "service not configured"})
			return
		}
		if !secureEqual(c.GetHeader(header), expected) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Next()
	}
}

<<<<<<< HEAD
// RequireWebhookToken validates the X-MSDA-Token header for n8n webhook calls.
=======
// RequireWebhookToken memvalidasi header X-MSDA-Token untuk panggilan webhook n8n.
>>>>>>> 478bbba (modified backend for update msda)
func RequireWebhookToken() gin.HandlerFunc {
	return requireSharedToken("MSDA_WEBHOOK_TOKEN", "X-MSDA-Token")
}

// RequireInternalToken memvalidasi header X-Internal-Token. Header ini hanya
// dikirim oleh server Next.js (dashboard) setelah ia memverifikasi sesi login
// pengguna, jadi request langsung ke backend tanpa token ini selalu ditolak.
func RequireInternalToken() gin.HandlerFunc {
	return requireSharedToken("MSDA_INTERNAL_TOKEN", "X-Internal-Token")
}

// ── Actor ─────────────────────────────────────────────────────────────────────

const actorKey = "msda_actor"

// Actor menyimpan nama pengguna dashboard (diteruskan proxy lewat X-MSDA-User) ke
// konteks request. Header ini hanya dipercaya karena RequireInternalToken harus
// sudah lolos lebih dulu. Dipakai untuk mengisi ack_by dan sejenisnya.
func Actor() gin.HandlerFunc {
	return func(c *gin.Context) {
<<<<<<< HEAD
		expected := os.Getenv("MSDA_WEBHOOK_TOKEN")
		token := c.GetHeader("X-MSDA-Token")
		if expected != "" && token != expected {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid webhook token"})
			return
=======
		u := strings.TrimSpace(c.GetHeader("X-MSDA-User"))
		if len(u) > 64 {
			u = u[:64]
>>>>>>> 478bbba (modified backend for update msda)
		}
		c.Set(actorKey, u)
		c.Next()
	}
}

// ActorFrom mengembalikan nama pengguna dashboard untuk request ini ("" bila tidak ada).
func ActorFrom(c *gin.Context) string {
	return c.GetString(actorKey)
}
