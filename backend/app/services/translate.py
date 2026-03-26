"""
Translation Service
DeepL 1차 번역 + GPT-4o-mini 상품명 교정 파이프라인

캐싱 전략:
  - Redis key: translate:{lang}:{sha256(text)}
  - TTL: settings.TRANSLATION_CACHE_TTL (기본 24h)
  - DeepL 미설정 시 GPT 단독 fallback
  - 둘 다 미설정 시 원문 반환 (개발 환경)
"""
import hashlib
import json
import logging
from typing import Optional

import redis as redis_lib

from app.core.config import settings

logger = logging.getLogger(__name__)

# Redis 클라이언트 (optional — 없으면 캐싱 건너뜀)
_redis: Optional[redis_lib.Redis] = None


def _get_redis() -> Optional[redis_lib.Redis]:
    global _redis
    if _redis is not None:
        return _redis
    try:
        _redis = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
        _redis.ping()
        return _redis
    except Exception:
        logger.warning("Redis 연결 실패 — 번역 캐싱 비활성화")
        _redis = None
        return None


def _cache_key(text: str, target_lang: str = "KO") -> str:
    digest = hashlib.sha256(text.encode()).hexdigest()[:16]
    return f"translate:{target_lang}:{digest}"


def _cache_get(key: str) -> Optional[str]:
    r = _get_redis()
    if r is None:
        return None
    try:
        return r.get(key)
    except Exception:
        return None


def _cache_set(key: str, value: str) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        r.setex(key, settings.TRANSLATION_CACHE_TTL, value)
    except Exception:
        pass


# ── DeepL ──────────────────────────────────────────────────────────────────


def _deepl_translate(text: str, target_lang: str = "KO") -> Optional[str]:
    """DeepL API로 텍스트 번역. API 키 없거나 실패 시 None 반환."""
    if not settings.DEEPL_API_KEY:
        return None
    try:
        import deepl  # type: ignore

        translator = deepl.Translator(settings.DEEPL_API_KEY)
        result = translator.translate_text(text, target_lang=target_lang)
        return str(result)
    except Exception as e:
        logger.warning(f"DeepL 번역 실패: {e}")
        return None


# ── OpenAI ─────────────────────────────────────────────────────────────────


def _openai_refine(
    original: str,
    deepl_result: Optional[str],
    mode: str = "product_name",
) -> Optional[str]:
    """
    GPT-4o-mini로 번역 교정.
    - mode='product_name': 상품명 자연스러운 한국어 교정
    - mode='translate': DeepL 결과 없을 때 직접 번역
    """
    if not settings.OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        if mode == "product_name":
            system_prompt = (
                "당신은 해외 직구 쇼핑몰 상품명 번역 전문가입니다. "
                "아래 영문 상품명과 기계 번역 결과를 보고, "
                "한국 쇼핑몰에서 검색되기 좋은 자연스러운 한국어 상품명으로 교정하세요. "
                "반드시 번역된 상품명만 한 줄로 출력하세요."
            )
            user_content = (
                f"원문: {original}\n"
                f"기계번역: {deepl_result or '(없음)'}\n"
                "교정된 한국어 상품명:"
            )
        else:  # translate
            system_prompt = (
                "당신은 영어→한국어 번역 전문가입니다. "
                "아래 영문 텍스트를 자연스러운 한국어로 번역하세요. "
                "번역 결과만 출력하세요."
            )
            user_content = original

        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            max_tokens=200,
            temperature=0.3,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"OpenAI 번역 실패: {e}")
        return None


# ── 공개 API ────────────────────────────────────────────────────────────────


def translate_text(text: str, target_lang: str = "KO") -> str:
    """
    일반 텍스트 번역 (DeepL → GPT fallback → 원문).
    주로 상품 설명(description) 번역에 사용.
    """
    if not text or not text.strip():
        return text

    key = _cache_key(text, target_lang)
    cached = _cache_get(key)
    if cached:
        logger.debug(f"번역 캐시 히트: {key}")
        return cached

    # 1단계: DeepL
    result = _deepl_translate(text, target_lang)

    # 2단계: OpenAI fallback (DeepL 실패 또는 미설정)
    if not result:
        result = _openai_refine(text, None, mode="translate")

    # 최종: 모두 실패하면 원문 반환
    if not result:
        logger.debug("번역 API 미설정 — 원문 반환")
        return text

    _cache_set(key, result)
    return result


def translate_product_name(name: str, target_lang: str = "KO") -> str:
    """
    상품명 번역 (DeepL 직역 → GPT 교정 2단계 파이프라인).
    검색 품질을 위해 자연스러운 한국어 상품명 생성.
    """
    if not name or not name.strip():
        return name

    key = _cache_key(f"name:{name}", target_lang)
    cached = _cache_get(key)
    if cached:
        logger.debug(f"상품명 번역 캐시 히트: {key}")
        return cached

    # 1단계: DeepL 직역
    deepl_result = _deepl_translate(name, target_lang)

    # 2단계: GPT 교정
    refined = _openai_refine(name, deepl_result, mode="product_name")

    # 우선순위: GPT 교정 > DeepL 직역 > 원문
    result = refined or deepl_result or name

    _cache_set(key, result)
    logger.info(f"상품명 번역: [{name}] → [{result}]")
    return result
