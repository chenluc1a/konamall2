"""
Admin API Router
관리자 전용: 회원 목록, 주문 목록·상태 변경, 상품 목록·활성화, 대시보드 통계
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.db.session import get_db
from app.db.models import User, Order, Product, OrderItem
from app.core.deps import get_admin_user
from app.schemas.user import UserOut
from app.schemas.order import OrderOut
from app.schemas.product import ProductOut
from app.db.models import OrderStatus as OrderStatusEnum

router = APIRouter(prefix="/admin", tags=["Admin"])


def _order_to_out(order: Order) -> OrderOut:
    from app.schemas.order import OrderStatus as OrderStatusSchema
    payment_status = "completed" if order.paid_at else "pending"
    st = order.status.value if hasattr(order.status, "value") else str(order.status)
    return OrderOut(
        id=order.id,
        order_number=order.order_number,
        status=OrderStatusSchema(st),
        payment_status=payment_status,
        total_amount=int(order.total_amount or 0),
        items_count=len(order.items),
        created_at=order.created_at,
    )


# ── 통계 ────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """관리자: 대시보드용 통계 (기본 + 이번달 매출 + 요일별 추이)."""
    users_total = db.query(User).count()
    orders_total = db.query(Order).count()
    orders_paid = db.query(Order).filter(Order.paid_at.isnot(None)).count()
    products_total = db.query(Product).count()
    products_active = db.query(Product).filter(Product.is_active == True).count()

    # 전체 매출 합계
    revenue_result = db.query(func.sum(Order.total_amount)).filter(
        Order.paid_at.isnot(None)
    ).scalar()
    revenue_total = int(revenue_result or 0)

    # 이번달 매출
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    revenue_this_month_result = db.query(func.sum(Order.total_amount)).filter(
        Order.paid_at.isnot(None),
        Order.paid_at >= month_start,
    ).scalar()
    revenue_this_month = int(revenue_this_month_result or 0)

    # 오늘 주문 수
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    orders_today = db.query(Order).filter(Order.created_at >= today_start).count()

    # 최근 7일 일별 매출 (그래프용)
    daily_revenue = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        day_rev = db.query(func.sum(Order.total_amount)).filter(
            Order.paid_at.isnot(None),
            Order.paid_at >= day_start,
            Order.paid_at < day_end,
        ).scalar()
        daily_revenue.append({
            "date": day_start.strftime("%m/%d"),
            "revenue": int(day_rev or 0),
        })

    # 주문 상태별 카운트
    status_counts = {}
    for st in OrderStatusEnum:
        cnt = db.query(Order).filter(Order.status == st).count()
        status_counts[st.value] = cnt

    return {
        "users_total": users_total,
        "orders_total": orders_total,
        "orders_paid": orders_paid,
        "orders_today": orders_today,
        "products_total": products_total,
        "products_active": products_active,
        "revenue_total": revenue_total,
        "revenue_this_month": revenue_this_month,
        "daily_revenue": daily_revenue,
        "status_counts": status_counts,
    }


# ── 회원 ────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut])
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """관리자: 전체 회원 목록 (가입일 최신순). 이메일·이름 검색 지원."""
    q = db.query(User).order_by(User.created_at.desc())
    if search:
        q = q.filter(
            (User.email.ilike(f"%{search}%")) | (User.name.ilike(f"%{search}%"))
        )
    users = q.offset((page - 1) * limit).limit(limit).all()
    return [
        UserOut(
            id=u.id,
            email=u.email,
            name=u.name,
            phone=u.phone,
            role=u.role.value if hasattr(u.role, "value") else str(u.role),
            is_active=u.is_active,
            created_at=u.created_at,
        )
        for u in users
    ]


# ── 주문 ────────────────────────────────────────────────────────────────────

@router.get("/orders", response_model=List[OrderOut])
async def list_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: str | None = Query(None, description="주문 상태 필터"),
    search: Optional[str] = Query(None, description="주문번호 검색"),
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """관리자: 전체 주문 목록 (최신순). 상태 필터 + 주문번호 검색."""
    q = db.query(Order).order_by(Order.created_at.desc())
    if status:
        try:
            q = q.filter(Order.status == OrderStatusEnum(status))
        except ValueError:
            pass
    if search:
        q = q.filter(Order.order_number.ilike(f"%{search}%"))
    orders = q.offset((page - 1) * limit).limit(limit).all()
    return [_order_to_out(o) for o in orders]


class OrderStatusUpdate(BaseModel):
    status: str


@router.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """관리자: 주문 상태 변경."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="주문을 찾을 수 없습니다.")
    try:
        order.status = OrderStatusEnum(body.status)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"유효하지 않은 상태값: {body.status}")
    db.commit()
    return {"order_id": order_id, "status": order.status.value}


# ── 상품 ────────────────────────────────────────────────────────────────────

@router.get("/products", response_model=List[ProductOut])
async def list_products(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    category: Optional[str] = None,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    untranslated: bool = False,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """관리자: 전체 상품 목록. 검색·카테고리·활성여부·미번역 필터 지원."""
    q = db.query(Product).order_by(Product.created_at.desc())
    if category:
        q = q.filter(Product.category == category)
    if search:
        q = q.filter(
            (Product.name.ilike(f"%{search}%")) | (Product.name_ko.ilike(f"%{search}%"))
        )
    if is_active is not None:
        q = q.filter(Product.is_active == is_active)
    if untranslated:
        q = q.filter(Product.name_ko == None)
    products = q.offset((page - 1) * limit).limit(limit).all()
    return products


class ProductActiveUpdate(BaseModel):
    is_active: bool


@router.patch("/products/{product_id}/active")
async def toggle_product_active(
    product_id: int,
    body: ProductActiveUpdate,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """관리자: 상품 활성/비활성 토글."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="상품을 찾을 수 없습니다.")
    product.is_active = body.is_active
    db.commit()
    return {"product_id": product_id, "is_active": product.is_active}


class ProductPriceUpdate(BaseModel):
    selling_price: int


@router.patch("/products/{product_id}/price")
async def update_product_price(
    product_id: int,
    body: ProductPriceUpdate,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """관리자: 상품 판매가 조정."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="상품을 찾을 수 없습니다.")
    product.selling_price = body.selling_price
    db.commit()
    return {
        "product_id": product_id,
        "selling_price": int(product.selling_price),
        "margin_rate": round((int(product.selling_price) - int(product.original_price or 0))
                             / max(int(product.original_price or 1), 1) * 100, 1),
    }


@router.post("/products/{product_id}/translate")
async def trigger_translate(
    product_id: int,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """관리자: 특정 상품 번역 즉시 실행 (Celery 태스크)."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="상품을 찾을 수 없습니다.")
    try:
        from app.tasks.product_sync import translate_product
        task = translate_product.delay(product_id)
        return {"product_id": product_id, "task_id": task.id, "queued": True}
    except Exception as e:
        # Celery 미실행 시 동기 실행
        from app.services.translate import translate_product_name, translate_text
        changed = False
        if product.name and not product.name_ko:
            product.name_ko = translate_product_name(product.name)
            changed = True
        if product.description and not product.description_ko:
            product.description_ko = translate_text(product.description)
            changed = True
        if changed:
            db.commit()
        return {"product_id": product_id, "task_id": None, "queued": False, "translated": changed}
