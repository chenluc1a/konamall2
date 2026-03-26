"""
Celery Configuration
Celery 설정 및 앱 인스턴스
"""
from celery import Celery
from app.core.config import settings

# Celery 앱 생성
celery_app = Celery(
    "konamall",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.product_sync",
        "app.tasks.order_process",
    ]
)

# Celery 설정
celery_app.conf.update(
    # 태스크 설정
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,
    
    # 결과 설정
    result_expires=3600,  # 1시간 후 결과 삭제
    
    # 워커 설정
    worker_prefetch_multiplier=1,
    worker_concurrency=4,
    
    # 재시도 설정
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    
    # 라우팅
    task_routes={
        "app.tasks.product_sync.*": {"queue": "sync"},
        "app.tasks.order_process.*": {"queue": "orders"},
    },
    
    # 스케줄링 (Beat)
    beat_schedule={
        # 매 6시간마다 상품 동기화
        "sync-products-every-6-hours": {
            "task": "app.tasks.product_sync.sync_all_suppliers",
            "schedule": 6 * 60 * 60,  # 6시간
        },
        # 매 1시간마다 주문 상태 업데이트
        "update-order-status-every-hour": {
            "task": "app.tasks.order_process.update_all_order_statuses",
            "schedule": 60 * 60,  # 1시간
        },
        # 매 30분마다 미번역 상품 번역 배치
        "translate-untranslated-every-30-min": {
            "task": "app.tasks.product_sync.translate_untranslated_batch",
            "schedule": 30 * 60,  # 30분
            "kwargs": {"limit": 50},
        },
    },
)


# 태스크 기본 설정
class BaseTaskWithRetry(celery_app.Task):
    """재시도 기능이 있는 기본 태스크"""
    autoretry_for = (Exception,)
    retry_kwargs = {"max_retries": 3}
    retry_backoff = True
    retry_backoff_max = 600  # 최대 10분
    retry_jitter = True
