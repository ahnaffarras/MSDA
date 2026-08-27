package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/sata-ai/backend/internal/repository"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

type DNSInfoHandler struct {
	repo *repository.DNSInfoRepo
}

func NewDNSInfoHandler(repo *repository.DNSInfoRepo) *DNSInfoHandler {
	return &DNSInfoHandler{repo: repo}
}

func (h *DNSInfoHandler) List(c *gin.Context) {
	page, _  := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 { page = 1 }
	if limit < 1 || limit > 100 { limit = 20 }

	filter := bson.M{}
	if t := c.Query("type");   t != "" { filter["type"] = t }
	if g := c.Query("group");  g != "" { filter["group"] = g }
	if s := c.Query("search"); s != "" {
		filter["$or"] = bson.A{
			bson.M{"domain":                     bson.M{"$regex": s, "$options": "i"}},
			bson.M{"info_app.company_responsible": bson.M{"$regex": s, "$options": "i"}},
			bson.M{"group":                       bson.M{"$regex": s, "$options": "i"}},
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
		"meta": gin.H{
			"page": page, "limit": limit,
			"total": total, "total_pages": totalPages,
		},
	})
}

func (h *DNSInfoHandler) Detail(c *gin.Context) {
	domain := c.Param("domain")
	item, err := h.repo.GetByDomain(c.Request.Context(), domain)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "domain not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

func (h *DNSInfoHandler) Groups(c *gin.Context) {
	groups, err := h.repo.DistinctGroups(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": groups})
}

func (h *DNSInfoHandler) Types(c *gin.Context) {
	types, err := h.repo.DistinctTypes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": types})
}
