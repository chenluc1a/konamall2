"""
Product Sync Tasks
상품 동기화 Celery 태스크
"""
from celery import shared_task
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
import logging

from app.celery_app import celery_app
from app.db.session import SessionLocal
from app.db.models import Supplier, Product, ProductImage, ProductVariant
from app.connectors import get_connector

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="app.tasks.product_sync.sync_supplier_products")
def sync_supplier_products(self, supplier_id: int, limit: int = 100) -> dict:
    """
    특정 공급자의 상품 동기화
    
    Args:
        supplier_id: 공급자 ID
        limit: 동기화할 최대 상품 수
    
    Returns:
        동기화 결과 (신규, 업데이트, 실패 수)
    """
    db = SessionLocal()
    result = {
        "supplier_id": supplier_id,
        "limit": limit,
        "created": 0,
        "updated": 0,
        "failed": 0,
        "errors": []
    }
    
    try:
        supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
        if not supplier:
            raise ValueError(f"Supplier {supplier_id} not found")
        
        if not supplier.is_active:
            logger.info(f"Supplier {supplier.name} is inactive, skipping")
            return result
        
        # 커넥터 가져오기
        connector = get_connector(supplier.supplier_type.value)
        if not connector:
            raise ValueError(f"No connector for {supplier.supplier_type}")
        
        # 상품 목록 가져오기
        logger.info(f"Fetching products from {supplier.name}...")
        products_data = connector.fetch_products(
            api_key=supplier.api_key,
            api_secret=supplier.api_secret,
            config=supplier.config or {},
            limit=limit,
        )
        
        for product_data in products_data:
            try:
                external_id = product_data.get("external_id") or product_data.get("id")
                if not external_id:
                    continue
                
                external_id = str(external_id)
                
                # 기존 상품 찾기
                existing = db.query(Product).filter(
                    Product.supplier_id == supplier_id,
                    Product.external_id == external_id
                ).first()
                
                # 가격 계산 (마진 적용)
                price_usd = float(product_data.get("price", 0))
                exchange_rate = supplier.config.get("exchange_rate", 1350)
                margin_percent = supplier.config.get("margin_percent", 30)
                price_krw = int(price_usd * exchange_rate * (1 + margin_percent / 100))
                
                if existing:
                    existing.name = product_data.get("title", product_data.get("name", existing.name))
                    existing.name_ko = product_data.get("title_ko", product_data.get("name_ko", existing.name_ko))
                    existing.description = product_data.get("description", existing.description)
                    existing.description_ko = product_data.get("description_ko", existing.description_ko)
                    existing.original_price = price_usd
                    existing.selling_price = price_krw
                    existing.stock = product_data.get("stock", 0)
                    existing.synced_at = datetime.utcnow()
                    result["updated"] += 1
                else:
                    new_product = Product(
                        supplier_id=supplier_id,
                        external_id=external_id,
                        name=product_data.get("title", product_data.get("name", "Unknown")),
                        name_ko=product_data.get("title_ko", product_data.get("name_ko")),
                        description=product_data.get("description"),
                        description_ko=product_data.get("description_ko"),
                        original_price=price_usd,
                        selling_price=price_krw,
                        currency="KRW",
                        stock=product_data.get("stock", 0),
                        category=product_data.get("category"),
                        external_url=product_data.get("url"),
                        synced_at=datetime.utcnow()
                    )
                    db.add(new_product)
                    db.flush()
                    images = product_data.get("images", [])
                    for i, img_url in enumerate(images):
                        img = ProductImage(
                            product_id=new_product.id,
                            url=img_url,
                            is_primary=(i == 0),
                            sort_order=i
                        )
                        db.add(img)
                    
                    # 옵션 추가
                    variants = product_data.get("variants", [])
                    for var_data in variants:
                        variant = ProductVariant(
                            product_id=new_product.id,
                            external_variant_id=str(var_data.get("id", "")),
                            name=var_data.get("name"),
                            sku=var_data.get("sku"),
                            price_krw=int(float(var_data.get("price", 0)) * exchange_rate * (1 + margin_percent / 100)),
                            stock=var_data.get("stock", 0)
                        )
                        db.add(variant)
                    
                    result["created"] += 1
                
                db.commit()
                
            except Exception as e:
                logger.error(f"Error processing product {product_data}: {e}")
                result["failed"] += 1
                result["errors"].append(str(e))
                db.rollback()
        
        logger.info(f"Sync completed for {supplier.name}: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Sync failed for supplier {supplier_id}: {e}")
        raise self.retry(exc=e)
    finally:
        db.close()


@celery_app.task(name="app.tasks.product_sync.sync_all_suppliers")
def sync_all_suppliers() -> dict:
    """모든 활성 공급자의 상품 동기화"""
    db = SessionLocal()
    results = []
    
    try:
        suppliers = db.query(Supplier).filter(Supplier.is_active == True).all()
        
        for supplier in suppliers:
            # 각 공급자별로 별도 태스크 실행
            task = sync_supplier_products.delay(supplier.id)
            results.append({
                "supplier_id": supplier.id,
                "supplier_name": supplier.name,
                "task_id": task.id
            })
        
        return {
            "total_suppliers": len(suppliers),
            "tasks": results
        }
    finally:
        db.close()


@celery_app.task(name="app.tasks.product_sync.translate_product")
def translate_product(product_id: int) -> dict:
    """상품 번역 (한글) — DeepL 1차 + GPT-4o-mini 2차 교정 파이프라인."""
    from app.services.translate import translate_product_name, translate_text

    db = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            return {"error": "Product not found", "product_id": product_id}

        changed = False

        # 상품명 번역 (2단계 파이프라인)
        if product.name and not product.name_ko:
            product.name_ko = translate_product_name(product.name)
            changed = True
            logger.info(f"[{product_id}] 상품명 번역: {product.name} → {product.name_ko}")

        # 상품 설명 번역 (DeepL 직역)
        if product.description and not product.description_ko:
            product.description_ko = translate_text(product.description)
            changed = True

        if changed:
            db.commit()

        return {
            "product_id": product_id,
            "translated": changed,
            "name_ko": product.name_ko,
        }
    except Exception as e:
        logger.error(f"translate_product 실패 (id={product_id}): {e}")
        db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(name="app.tasks.product_sync.translate_untranslated_batch")
def translate_untranslated_batch(limit: int = 50) -> dict:
    """
    name_ko가 없는 상품을 배치로 번역 큐에 적재.
    스케줄러에서 주기적으로 호출 (매 30분 등).
    """
    db = SessionLocal()
    try:
        products = (
            db.query(Product)
            .filter(Product.is_active == True, Product.name_ko == None)
            .limit(limit)
            .all()
        )
        task_ids = []
        for p in products:
            task = translate_product.delay(p.id)
            task_ids.append({"product_id": p.id, "task_id": task.id})

        logger.info(f"번역 배치 적재: {len(task_ids)}건")
        return {"queued": len(task_ids), "tasks": task_ids}
    finally:
        db.close()

