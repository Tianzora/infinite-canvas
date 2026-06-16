package router

import (
	"github.com/basketikun/infinite-canvas/handler"
	"github.com/gin-gonic/gin"
)

func registerAnnouncementRoutes(api *gin.RouterGroup, admin *gin.RouterGroup) {
	api.GET("/announcements", gin.WrapF(handler.Announcements))
	admin.GET("/announcements", gin.WrapF(handler.AdminAnnouncements))
	admin.POST("/announcements", gin.WrapF(handler.AdminSaveAnnouncement))
	admin.DELETE("/announcements/:id", func(c *gin.Context) {
		handler.AdminDeleteAnnouncement(c.Writer, c.Request, c.Param("id"))
	})
}
