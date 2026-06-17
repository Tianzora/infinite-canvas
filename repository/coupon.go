package repository

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// SaveCoupons 批量保存兑换码。
func SaveCoupons(coupons []model.Coupon) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.CreateInBatches(coupons, 100).Error
}

// GetCouponByCode 根据兑换码查询。
func GetCouponByCode(code string) (model.Coupon, bool, error) {
	db, err := DB()
	if err != nil {
		return model.Coupon{}, false, err
	}
	var coupon model.Coupon
	err = db.Where("code = ?", code).First(&coupon).Error
	if err == gorm.ErrRecordNotFound {
		return model.Coupon{}, false, nil
	}
	return coupon, err == nil, err
}

// ListCoupons 分页查询兑换码。
func ListCoupons(q model.Query, status string) ([]model.Coupon, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.Coupon{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("code LIKE ? OR used_by LIKE ?", like, like)
	}
	switch status {
	case "unused":
		tx = tx.Where("used_by = '' OR used_by IS NULL")
	case "used":
		tx = tx.Where("used_by != '' AND used_by IS NOT NULL")
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var coupons []model.Coupon
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&coupons).Error
	return coupons, total, err
}

// RedeemCoupon 在事务中兑换兑换码。
func RedeemCoupon(code string, userID string, ts string) (model.Coupon, bool, error) {
	db, err := DB()
	if err != nil {
		return model.Coupon{}, false, err
	}
	var coupon model.Coupon
	txErr := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("code = ?", code).First(&coupon).Error; err != nil {
			return err
		}
		if coupon.UsedBy != "" {
			return errCouponUsed
		}
		if !coupon.IsActive {
			return errCouponInactive
		}
		if coupon.ExpiresAt != "" && coupon.ExpiresAt < ts {
			return errCouponExpired
		}
		return tx.Model(&coupon).Updates(map[string]any{
			"used_by":  userID,
			"used_at":  ts,
			"is_active": false,
		}).Error
	})
	if txErr != nil {
		return model.Coupon{}, false, txErr
	}
	return coupon, true, nil
}

var errCouponUsed = &couponError{"兑换码已被使用"}
var errCouponInactive = &couponError{"兑换码已禁用"}
var errCouponExpired = &couponError{"兑换码已过期"}

type couponError struct {
	message string
}

func (e *couponError) Error() string   { return e.message }
func (e *couponError) SafeMessage() string { return e.message }

// DeleteCouponsByIDs 批量删除兑换码。
func DeleteCouponsByIDs(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Coupon{}, "id IN ?", ids).Error
}