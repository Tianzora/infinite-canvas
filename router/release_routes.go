package router

import (
	"github.com/basketikun/infinite-canvas/handler"
	"github.com/gin-gonic/gin"
)

func registerReleaseRoutes(api *gin.RouterGroup, admin *gin.RouterGroup) {
	api.GET("/releases", gin.WrapF(handler.Releases))
	admin.GET("/releases", gin.WrapF(handler.AdminReleases))
	admin.POST("/releases", gin.WrapF(handler.AdminSaveRelease))
	admin.POST("/releases/batch-delete", gin.WrapF(handler.AdminDeleteReleases))
	admin.POST("/releases/generate", gin.WrapF(handler.AdminGenerateRelease))
	admin.DELETE("/releases/:id", func(c *gin.Context) {
		handler.AdminDeleteRelease(c.Writer, c.Request, c.Param("id"))
	})
}
