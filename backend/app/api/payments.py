"""
Payments API Router
결제 준비·승인·상태 조회 (카카오페이/네이버페이 연동)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Any, Dict, Optional

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.db.models import User, Order, OrderStatus
from app.services.payment import get_payment_gateway

router = APIRouter(prefix="/payments", tags=["Payments"])


def _normalize_payment_url(data: Optional[Dict[str, Any]]) -> Optional[str]:
    """결제사별 prepare 응답 URL 키를 단일 payment_url로 정규화."""
    if not data:
        return None
    return (
        data.get("payment_url")
        or data.get("next_redirect_pc_url")
        or data.get("next_redirect_mobile_url")
        or data.get("next_redirect_app_url")
        or data.get("redirectUrl")
    )


def _callback_url(path: str) -> str:
    """PG 리다이렉트용 콜백 URL 생성 (/api prefix 포함)."""
    return f"{settings.BASE_URL}/api/payments/{path}"


def _get_gateway(gateway_type: str):
    """게이트웨이 인스턴스 생성(prepare/approve/status 공통 설정)."""
    return get_payment_gateway(
        gateway_type,
        admin_key=settings.KAKAO_PAY_ADMIN_KEY or "",
        cid=getattr(settings, "KAKAO_PAY_CID", "TC0ONETIME"),
        client_id=getattr(settings, "NAVER_PAY_CLIENT_ID", ""),
        client_secret=getattr(settings, "NAVER_PAY_CLIENT_SECRET", ""),
        chain_id=getattr(settings, "NAVER_PAY_CHAIN_ID", ""),
        approval_url=_callback_url("approve"),
        cancel_url=_callback_url("cancel"),
        fail_url=_callback_url("fail"),
        return_url=_callback_url("approve"),
    )


class PrepareIn(BaseModel):
    order_id: int
    gateway: str = "kakao_pay"  # kakao_pay | naver_pay


class ApproveIn(BaseModel):
    order_id: int
    payment_id: str
    pg_token: str
    gateway: str = "kakao_pay"


@router.post("/prepare")
async def prepare_payment(
    body: PrepareIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """결제 준비 (결제창 URL 등 반환)."""
    order = db.query(Order).filter(Order.id == body.order_id, Order.user_id == current_user.id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="주문을 찾을 수 없습니다.")
    if order.paid_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 결제 완료된 주문입니다.")
    gateway = _get_gateway(body.gateway)
    if not gateway:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="지원하지 않는 결제 수단입니다.")
    amount = int(order.total_amount or 0)
    result = await gateway.prepare(
        order_id=str(order.id),
        amount=amount,
        item_name=f"KonaMall 주문 #{order.order_number}",
        user_id=str(current_user.id),
    )
    if not result.success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.message)
    payment_url = _normalize_payment_url(result.data)
    if not payment_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="결제 준비 응답에 리다이렉트 URL이 없습니다.",
        )
    # 콜백에서 payment_id를 안정적으로 찾을 수 있도록 저장
    order.payment_id = result.payment_id
    db.commit()
    return {
        "payment_id": result.payment_id,
        "payment_url": payment_url,
        "message": result.message,
        "gateway": body.gateway,
    }


@router.get("/approve")
async def approve_callback(
    order_id: int,
    pg_token: str = "",
    gateway: str = "kakao_pay",
    payment_id: Optional[str] = None,
    tid: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    PG 리다이렉트 콜백(GET).
    카카오/네이버 콜백을 수신해 서버에서 승인 확정까지 처리.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="주문을 찾을 수 없습니다.")

    resolved_payment_id = payment_id or tid or order.payment_id
    if not resolved_payment_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payment_id(tid)가 없습니다.")
    if gateway == "kakao_pay" and not pg_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="pg_token이 필요합니다.")

    # 이미 승인 처리된 주문이면 중복 승인 호출 방지
    if order.paid_at:
        return {
            "success": True,
            "message": "이미 결제 완료된 주문입니다.",
            "order_id": order.id,
            "payment_id": order.payment_id or resolved_payment_id,
            "status": "approved",
            "already_paid": True,
        }

    gateway_instance = _get_gateway(gateway)
    if not gateway_instance:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="지원하지 않는 결제 수단입니다.")

    result = await gateway_instance.approve(
        payment_id=resolved_payment_id,
        pg_token=pg_token,
        order_id=str(order.id),
        user_id=str(order.user_id),
    )
    if not result.success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.message)

    from datetime import datetime
    order.payment_id = result.payment_id
    order.paid_at = datetime.utcnow()
    order.status = OrderStatus.PAID
    db.commit()

    return {
        "success": True,
        "message": "결제 승인 완료",
        "order_id": order.id,
        "gateway": gateway,
        "payment_id": result.payment_id,
        "status": result.status,
        "data": result.data,
    }


@router.get("/cancel")
async def cancel_callback(
    order_id: Optional[int] = None,
    gateway: str = "kakao_pay",
):
    """PG 결제 취소 리다이렉트 콜백."""
    return {
        "success": False,
        "status": "cancelled",
        "message": "사용자가 결제를 취소했습니다.",
        "order_id": order_id,
        "gateway": gateway,
    }


@router.get("/fail")
async def fail_callback(
    order_id: Optional[int] = None,
    gateway: str = "kakao_pay",
):
    """PG 결제 실패 리다이렉트 콜백."""
    return {
        "success": False,
        "status": "failed",
        "message": "결제 처리에 실패했습니다.",
        "order_id": order_id,
        "gateway": gateway,
    }


@router.post("/approve")
async def approve_payment(
    body: ApproveIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """결제 승인 (PG 리다이렉트 후 pg_token으로 호출). 성공 시 주문에 paid_at, payment_id 반영."""
    order = db.query(Order).filter(Order.id == body.order_id, Order.user_id == current_user.id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="주문을 찾을 수 없습니다.")

    # GET 콜백에서 이미 처리됐을 수 있어 idempotent하게 성공 응답
    if order.paid_at:
        return {
            "success": True,
            "payment_id": order.payment_id,
            "status": "approved",
            "order_id": body.order_id,
            "already_paid": True,
        }

    gateway = _get_gateway(body.gateway)
    if not gateway:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="지원하지 않는 결제 수단입니다.")
    result = await gateway.approve(
        payment_id=body.payment_id,
        pg_token=body.pg_token,
        order_id=str(body.order_id),
        user_id=str(current_user.id),
    )
    if not result.success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.message)
    from datetime import datetime
    order.payment_id = result.payment_id
    order.paid_at = datetime.utcnow()
    order.status = OrderStatus.PAID
    db.commit()
    return {"success": True, "payment_id": result.payment_id, "status": result.status, "order_id": body.order_id, "data": result.data}


@router.get("/status/{payment_id}")
async def payment_status(
    payment_id: str,
    gateway: str = "kakao_pay",
):
    """결제 상태 조회."""
    gateway_instance = _get_gateway(gateway)
    if not gateway_instance:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="지원하지 않는 결제 수단입니다.")
    result = await gateway_instance.get_status(payment_id)
    return {"payment_id": payment_id, "success": result.success, "status": result.status, "message": result.message}
