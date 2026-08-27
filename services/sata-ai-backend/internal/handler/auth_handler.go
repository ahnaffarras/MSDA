package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sata-ai/backend/internal/middleware"
	"github.com/sata-ai/backend/internal/model"
	"github.com/sata-ai/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	repo *repository.AdminRepo
}

func NewAuthHandler(repo *repository.AdminRepo) *AuthHandler {
	return &AuthHandler{repo: repo}
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	admin, err := h.repo.FindByUsername(c.Request.Context(), req.Username)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := middleware.GenerateToken(admin.ID.Hex(), admin.Username, admin.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": model.LoginResponse{Token: token, Admin: *admin}})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	// JWT is stateless — client should delete token. 
	// For server-side invalidation, store token in Redis blocklist here.
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "logged out"}})
}

func (h *AuthHandler) Me(c *gin.Context) {
	username, _ := c.Get("username")
	adminID, _  := c.Get("admin_id")
	role, _      := c.Get("role")
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"id":       adminID,
		"username": username,
		"role":     role,
	}})
}
