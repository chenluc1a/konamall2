# CLAUDE.md — KonaMall AI 개발 지침

> Claude(및 Cursor, Copilot 등 AI 도구)가 이 프로젝트에서 코드 작업, 커밋 메시지 생성, PR 작성 시 반드시 따르는 지침 문서입니다.

---

## 📐 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트** | KonaMall — 글로벌 드롭쉬핑 커머스 플랫폼 |
| **모델** | CJ Dropshipping(직판) + AliExpress Affiliate(커미션) |
| **백엔드** | FastAPI + PostgreSQL + Redis + Celery |
| **프론트엔드** | Next.js 14 (App Router) + Tailwind CSS + Zustand |
| **인프라** | Docker Compose · Vercel · Railway · Cloudflare R2 |
| **언어** | Python 3.12 / TypeScript 5 |

---

## 📁 폴더 구조 규칙

```
konamall2/
├─ backend/app/
│  ├─ api/          # 라우터 — products, cart, orders, payments, users, admin, suppliers
│  ├─ connectors/   # 외부 공급처 클라이언트 (CJ, AliExpress, Amazon…)
│  ├─ core/         # config.py, security.py (JWT/bcrypt)
│  ├─ db/           # models.py (SQLAlchemy), session.py
│  ├─ schemas/      # Pydantic 입출력 스키마
│  ├─ services/     # 비즈니스 로직 서비스 (payment.py 등)
│  └─ tasks/        # Celery 태스크 (order_process, product_sync, notifications)
├─ frontend/src/
│  ├─ app/          # Next.js App Router 페이지
│  ├─ components/
│  │  ├─ home/      # 홈 전용 컴포넌트
│  │  ├─ layout/    # Header, Footer, BottomNav, StorefrontShell
│  │  └─ product/   # 상품 관련 컴포넌트
│  ├─ lib/          # api.ts (axios 인스턴스)
│  ├─ store/        # Zustand 스토어 (cartStore, authStore)
│  └─ types/        # TypeScript 타입 정의
└─ docs/            # 운영·배포 문서
```

---

## 🧵 Git Commit Convention

### 형식

```
<이모지> <타입>(<스코프>): <한국어 요약>

<본문>

<푸터>
```

### 타입 & 이모지 매핑

| 이모지 | 타입       | 설명                            |
|--------|------------|---------------------------------|
| ✨     | feat       | 새로운 기능 추가                |
| 🐛     | fix        | 버그 수정                       |
| 💡     | chore      | 주석, 포맷 등 자잘한 수정       |
| 📝     | docs       | 문서 수정                       |
| 🚚     | build      | 빌드/패키지 관련 수정           |
| ✅     | test       | 테스트 코드 추가/수정           |
| ♻️     | refactor   | 기능 변화 없는 리팩터링         |
| 🚑     | hotfix     | 긴급 수정                       |
| ⚙️     | ci         | CI/CD 변경                      |
| 🔧     | config     | 설정 파일 수정                  |
| 🗑️     | remove     | 불필요 파일/코드 삭제           |
| 🔒     | security   | 보안 관련 수정                  |
| 🚀     | deploy     | 배포 관련 커밋                  |
| 🧩     | style      | 코드 스타일 변경                |
| 🎨     | ui         | UI/템플릿/CSS 변경              |
| 🔄     | sync       | 코드/데이터 동기화              |
| 🔥     | clean      | 코드/로그 정리                  |
| 🧠     | perf       | 성능 개선                       |

### 스코프 예시

| 스코프 | 대상 |
|--------|------|
| `products` | 상품 목록·상세·동기화 |
| `orders` | 주문 생성·조회 |
| `payments` | 결제 준비·승인·환불 |
| `cart` | 장바구니 CRUD |
| `users` | 회원가입·로그인·마이페이지 |
| `admin` | 관리자 대시보드 |
| `translate` | 번역 파이프라인 |
| `sync` | 공급처 상품 동기화 |
| `notify` | 카카오 알림톡 |
| `infra` | Docker·Nginx·CI |

### 규칙

- 제목은 **한국어**, 50자 이내, 마침표 없음
- 본문 각 줄 72자 이내, 변경 이유 서술
- 하나의 커밋 = 하나의 타입
- 이모지 **필수** (생략 금지)
- Breaking Change → 푸터에 `BREAKING CHANGE:` 명시
- 이슈 연결 → `Fixes #N` 또는 `Refs #N`

### 예시

```
✨ feat(translate): DeepL + GPT-4o-mini 번역 파이프라인 구현

- product_sync.py에서 DeepL 1차 직역 후 GPT-4o-mini 상품명 교정
- Redis TTL 24h 캐싱으로 중복 번역 방지 (비용 90% 절감)
- DEEPL_API_KEY, OPENAI_API_KEY 환경변수 필요

Refs #15
```

```
🐛 fix(payments): 결제 승인 후 Order status PAID 미반영 수정

- approve 엔드포인트에서 Order.paid_at·status 업데이트 누락
- Celery 발주 태스크 트리거 타이밍 조정

Fixes #23
```

```
🎨 ui(home): FlashSaleBanner 카운트다운 모바일 레이아웃 개선

- 소형 화면에서 텍스트 줄바꿈 방지 (whitespace-nowrap)
- 카운트다운 폰트 크기 반응형 조정
```

---

## 🐍 백엔드 코딩 규칙

### FastAPI

- **의존성 주입**: `Depends(get_db)`, `Depends(get_current_user)`, `Depends(get_admin_user)` 사용
- **스키마 분리**: 요청(`In`)·응답(`Out`) Pydantic 모델 분리
- **HTTP 예외**: `raise HTTPException(status_code=..., detail=...)` 사용
- **비동기**: I/O 작업은 가능하면 `async def` 사용
- **라우터**: `APIRouter` 사용, `main.py`에서 `include_router()`

### DB

- **ORM**: SQLAlchemy 모델 사용 (`app/db/models.py`)
- **마이그레이션**: 스키마 변경 시 반드시 `alembic revision --autogenerate -m "설명"` 후 반영
- **세션**: `with db:` 컨텍스트 또는 `try/finally db.close()` 패턴

### Celery 태스크

- **바인딩**: `@celery.task(bind=True, max_retries=3)` 기본
- **큐**: Redis 브로커 (`redis://redis:6379/0`)
- **재시도**: `self.retry(exc=..., countdown=60)` 패턴

---

## ⚛️ 프론트엔드 코딩 규칙

### Next.js

- **App Router**: `app/` 디렉토리 사용 (`pages/` 사용 금지)
- **서버 컴포넌트 우선**: `'use client'`는 상태·이벤트 필요 시에만
- **데이터 페칭**: 서버 컴포넌트에서 fetch 또는 `lib/api.ts` axios 인스턴스
- **메타데이터**: 각 페이지 `export const metadata: Metadata = {...}` 선언

### 상태 관리

- **Zustand**: `store/cartStore.ts`, `store/authStore.ts`
- **서버 상태**: `@tanstack/react-query` 또는 `useEffect` + axios (현재 패턴 유지)

### 스타일

- **Tailwind CSS**: 유틸리티 클래스 사용
- **공통 컴포넌트 클래스**: `globals.css`에 `@layer components` 정의 (`btn-primary`, `product-card` 등)
- **인라인 스타일**: 가능하면 Tailwind로 대체; 동적 색상만 인라인 허용

### 타입

- `types/` 폴더에 공유 타입 정의
- `any` 사용 금지 (불가피할 경우 `// eslint-disable` 주석 필수)

---

## 🔒 보안 규칙

- **시크릿 노출 금지**: `.env` 파일 절대 커밋 금지 (`.gitignore` 확인 필수)
- **SQL Injection**: ORM 사용으로 방지, raw query 시 파라미터 바인딩
- **CORS**: `settings.CORS_ORIGINS`에만 허용 (와일드카드 프로덕션 금지)
- **비밀번호**: bcrypt 해시 필수, 평문 저장 금지
- **결제 Webhook**: 서명 검증 필수 (`X-Toss-Signature` 등)

---

## 🌐 API 설계 규칙

- **RESTful**: `GET /api/products`, `POST /api/orders`, `PATCH /api/orders/{id}` 등
- **접두사**: 전체 API `/api/*`
- **인증 필요**: `Authorization: Bearer <token>` 헤더
- **응답 형식**: JSON, 에러 시 `{"detail": "에러 메시지"}` 통일
- **페이지네이션**: `?page=1&size=20` 쿼리 파라미터

---

## 📌 Claude에게 요청할 때

### 커밋 메시지 생성

> "변경된 내용을 보고 CLAUDE.md 커밋 컨벤션에 맞게 커밋 메시지 작성해줘."

### 코드 작성 요청 시 포함할 정보

1. **대상 레이어**: 백엔드 API / 프론트 컴포넌트 / DB 모델 / Celery 태스크
2. **스코프**: 어떤 기능 영역인지 (products / payments / translate 등)
3. **기존 연관 파일**: 수정이 필요한 파일 경로
4. **완료 기준**: 무엇이 동작하면 완료인지

### 금지 사항

- `@app.get`에 직접 비즈니스 로직 작성 (→ `services/` 분리)
- `pages/` 라우팅 사용 (App Router 전용)
- `console.log` 프로덕션 코드에 남기기
- `print()` 디버그 출력 커밋 (→ `logging` 사용)
