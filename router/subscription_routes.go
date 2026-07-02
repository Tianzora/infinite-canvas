package router

import (
	"github.com/basketikun/infinite-canvas/handler"
	"github.com/basketikun/infinite-canvas/middleware"
	"github.com/gin-gonic/gin"
)

func registerSubscriptionRoutes(api *gin.RouterGroup, admin *gin.RouterGroup) {
	api.GET("/subscription/plans", gin.WrapF(handler.SubscriptionPlans))
	api.GET("/subscription/me", middleware.UserAuth, gin.WrapF(handler.CurrentSubscription))
	admin.GET("/subscription-plans", gin.WrapF(handler.AdminSubscriptionPlans))
	admin.POST("/subscription-plans", gin.WrapF(handler.AdminSaveSubscriptionPlan))
	admin.DELETE("/subscription-plans/:id", func(c *gin.Context) {
		handler.AdminDisableSubscriptionPlan(c.Writer, c.Request, c.Param("id"))
	})
}
