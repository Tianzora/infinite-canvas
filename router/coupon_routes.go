package router

import (
	"github.com/basketikun/infinite-canvas/handler"
	"github.com/basketikun/infinite-canvas/middleware"
	"github.com/gin-gonic/gin"
)

func registerCouponRoutes(api *gin.RouterGroup, admin *gin.RouterGroup) {
	api.POST("/coupons/redeem", middleware.UserAuth, gin.WrapF(handler.RedeemCoupon))
	admin.POST("/coupons/generate", gin.WrapF(handler.AdminGenerateCoupons))
	admin.GET("/coupons", gin.WrapF(handler.AdminCoupons)
	admin.POST("/coupons/batch-delete", gin.WrapF(handler.AdminDeleteCoupons)))
}
