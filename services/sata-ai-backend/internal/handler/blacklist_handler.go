package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/sata-ai/backend/internal/model"
	"github.com/sata-ai/backend/internal/repository"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type BlacklistHandler struct {
	repo *repository.BlacklistRepo
}

func NewBlacklistHandler(repo *repository.BlacklistRepo) *BlacklistHandler {
	return &BlacklistHandler{repo: repo}
}

func (h *BlacklistHandler) List(c *gin.Context) {
	page, _  := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 { page = 1 }
	if limit < 1 || limit > 100 { limit = 20 }

	filter := bson.M{}
	if t  := c.Query("type");          t != ""  { filter["type"] = t }
	if bl := c.Query("blocked_level"); bl != "" { filter["blocked_level"] = bl }
	if ia := c.Query("is_active");     ia != "" {
		filter["is_active"] = ia == "true"
	}
	if s := c.Query("search"); s != "" {
		filter["$or"] = bson.A{
			bson.M{"domain": bson.M{"$regex": s, "$options": "i"}},
			bson.M{"group":  bson.M{"$regex": s, "$options": "i"}},
		}
	}

	items, total, err := h.repo.List(c.Request.Context(), filter, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	totalPages := int(total) / limit
	if int(total)%limit != 0 { totalPages++ }

	c.JSON(http.StatusOK, gin.H{
		"data": items,
		"meta": gin.H{"page": page, "limit": limit, "total": total, "total_pages": totalPages},
	})
}

func (h *BlacklistHandler) GetByID(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	item, err := h.repo.GetByID(c.Request.Context(), id)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

func (h *BlacklistHandler) Create(c *gin.Context) {
	var req model.BlacklistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Validate: domain required when blocked_level=domain
	if req.BlockedLevel == "domain" && req.Domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain is required when blocked_level is 'domain'"})
		return
	}
	if req.BlockedLevel == "group" && req.Group == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "group is required when blocked_level is 'group'"})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	entry := &model.DNSBlacklist{
		BlockedLevel: req.BlockedLevel,
		Domain:       req.Domain,
		Group:        req.Group,
		Type:         req.Type,
		IsActive:     isActive,
	}

	result, err := h.repo.Create(c.Request.Context(), entry)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": result})
}

func (h *BlacklistHandler) Update(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req model.BlacklistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	update := bson.M{
		"blocked_level": req.BlockedLevel,
		"type":          req.Type,
	}
	if req.Domain != "" { update["domain"] = req.Domain }
	if req.Group  != "" { update["group"]  = req.Group }
	if req.IsActive != nil { update["is_active"] = *req.IsActive }

	result, err := h.repo.Update(c.Request.Context(), id, update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

func (h *BlacklistHandler) ToggleActive(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	result, err := h.repo.ToggleActive(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

func (h *BlacklistHandler) Delete(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.repo.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"deleted": true}})
}
