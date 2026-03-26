import json
from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List, Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "KonaMall"
    DEBUG: bool = True
    BASE_URL: str = "http://localhost:3000"
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/konamall"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # JWT (운영 환경에서는 반드시 환경 변수로 32자 이상 랜덤 값 설정)
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"

    # 프로덕션에서 기본 SECRET_KEY 사용 시 경고 (startup에서 검사)
    _DEFAULT_SECRET = "your-super-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS (env: JSON 배열 또는 쉼표 구분 문자열)
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("["):
                try:
                    return json.loads(s)
                except json.JSONDecodeError:
                    pass
            return [x.strip() for x in s.split(",") if x.strip()]
        return v

    # Exchange Rate
    DEFAULT_EXCHANGE_RATE: float = 1350.0  # USD to KRW
    
    # Pricing
    DEFAULT_MARGIN_PERCENT: float = 30.0
    FREE_SHIPPING_THRESHOLD_KRW: int = 50000
    DEFAULT_SHIPPING_COST_KRW: int = 3000
    
    # KakaoPay
    KAKAO_PAY_ADMIN_KEY: Optional[str] = None
    KAKAO_PAY_CID: str = "TC0ONETIME"  # 테스트용 CID
    
    # NaverPay
    NAVER_PAY_CLIENT_ID: Optional[str] = None
    NAVER_PAY_CLIENT_SECRET: Optional[str] = None
    NAVER_PAY_CHAIN_ID: Optional[str] = None

    # Translation
    DEEPL_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    TRANSLATION_CACHE_TTL: int = 86400  # 24h (seconds)

    # Cloudflare R2 (Image CDN)
    R2_ACCOUNT_ID: Optional[str] = None
    R2_ACCESS_KEY_ID: Optional[str] = None
    R2_SECRET_ACCESS_KEY: Optional[str] = None
    R2_BUCKET_NAME: str = "konamall-images"
    R2_PUBLIC_URL: Optional[str] = None  # e.g. https://images.konamall.com

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()


def ensure_production_secret():
    """DEBUG=false 일 때 기본 SECRET_KEY 사용 시 경고. main lifespan에서 호출."""
    if not settings.DEBUG and settings.SECRET_KEY.strip() == Settings._DEFAULT_SECRET:
        import warnings
        warnings.warn(
            "SECRET_KEY is still the default. Set a strong SECRET_KEY in .env for production.",
            UserWarning,
            stacklevel=2,
        )
