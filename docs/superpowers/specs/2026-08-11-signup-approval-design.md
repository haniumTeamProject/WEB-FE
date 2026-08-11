# 회원가입 폼 + 가입 신청 관리 페이지 설계

## 배경

관리자웹 기능 명세서 1.1.1~1.1.3(가입 신청/가입 승인/로그인)은 백엔드(bleServer `feature/backend-crud-auth`)가 이미 완료된 상태로 실 API 연동만 남아 있다. 프론트는 `SignupPage`, `AccountApprovalPage`가 제목만 있는 스텁이라 이번 작업에서 채운다. 지금 단계는 기존 코드베이스 전체와 동일하게 MSW 목업 기반으로 구현하고, 실 API 연동은 별도 작업(8/18 예정, 프로젝트 메모리 참고)으로 미룬다.

## 범위

**포함**
- 회원가입 폼 (`SignupPage`)
- 가입 신청 관리 페이지 (`AccountApprovalPage`) — 목록 조회 + 승인/거절
- 위 두 화면에 필요한 최소한의 mock 데이터/API/훅
- "가입 신청 관리" 진입에 필요한 최소 역할(super_admin) 체크

**제외 (이번 작업 범위 아님)**
- 로그인이 PENDING/REJECTED 상태를 인식해 `/pending`, `/rejected`로 분기하는 것 — 로그인 mock은 지금처럼 자격증명 없이 항상 성공하는 상태를 유지한다. 상태 인식 로그인은 별도 작업으로 남긴다 (`/rejected` 라우트/페이지도 아직 없음 — 이것도 그 작업에서 같이 만든다).
- 비콘 `anchor` 타입 제거 등 MVP 정책과 어긋나는 기존 코드 정리 — 기능 명세서 8.1.1에서 "체크포인트/연결자 (앵커 구분 없음)"으로 재확인됐지만 이번 작업과 무관하므로 별도 이슈로 남긴다.
- 실제 백엔드 API 연동 (VITE_API_BASE_URL 전환)

## 데이터 모델

`src/types/domain.ts`에 이미 정의된 `Admin` 타입을 그대로 쓴다 (변경 없음):

```ts
export type AdminStatus = 'pending' | 'active' | 'rejected'
export type AdminRole = 'super_admin' | 'admin'

export interface Admin {
  id: string
  email: string
  name: string
  org: string
  position?: string
  phone?: string
  building?: string // 담당 건물 — 자유 텍스트
  status: AdminStatus
  role: AdminRole
  officialDocUrl?: string // 기관 공문(직인) — base64 data URL
  createdAt?: string
}
```

`src/features/auth/types.ts`의 `SignupRequest`를 확장한다:

```ts
export interface SignupRequest {
  email: string
  password: string
  name: string
  org: string
  building: string
  officialDocUrl: string // base64 data URL (기존 주석의 "multipart 별도 전송"은 이번 단계에서 보류)
}
```

## Mock 데이터 (`src/mocks/db.ts`)

`db`에 `admins: Admin[]` 배열을 추가하고 다음을 시드한다:

- **시드 super_admin 1개** — `GET /admin/me`가 항상 반환할 "현재 로그인한 사람" 역할. 역할 체크(아래 참고)를 위한 최소 장치.
- **PENDING 신청 2건** — 승인 관리 페이지를 빈 화면 없이 확인할 수 있도록. `officialDocUrl`에 더미 data URL(간단한 SVG/텍스트 기반)을 채워 "공문 보기" 링크가 실제로 열리게 한다.

## Mock API (`src/mocks/handlers.ts`)

| 엔드포인트 | 동작 |
| --- | --- |
| `POST /admin/auth/signup` | body(email/password/name/org/building/officialDocUrl) 검증 → 이메일 중복 시 409 → 통과 시 `status: 'pending'`, `role: 'admin'`, `createdAt: new Date().toISOString()`인 Admin을 `db.admins`에 추가, 201 |
| `GET /admin/accounts?status=pending` | `db.admins`에서 status가 pending인 것만, 가입 신청일(createdAt) 내림차순으로 반환 |
| `PATCH /admin/accounts/:id` | body `{ status: 'active' | 'rejected' }` — 해당 admin의 status 갱신 |
| `GET /admin/me` | 로그인 mock과 동일하게 자격증명 확인 없이 항상 시드 super_admin을 반환 (실 API 전환 시 JWT 디코딩/진짜 `/me`로 교체될 자리) |

## 프론트 구조

새 feature 모듈 `src/features/admin/`:
- `types.ts` — `Admin` 타입은 재정의하지 않고 `@/types/domain`에서 그대로 import해 사용. 이 파일엔 요청/응답 전용 타입만 추가 (예: `UpdateAdminStatusRequest { status: 'active' | 'rejected' }`). 목록 조회는 `Admin[]`을 그대로 반환하므로 별도 응답 타입 불필요
- `api.ts` — 위 4개 엔드포인트 호출 함수
- `hooks.ts` — `usePendingAdmins()`, `useApproveAdmin()`, `useRejectAdmin()`, `useCurrentAdmin()`

다른 신규/수정 코드 전반에도 동일한 원칙 적용: 기존 타입(`Admin`, `AdminStatus`, `AdminRole` 등)과 기존 패턴(`readFileAsDataURL`, `ConfirmDialog`, `AsyncState`, react-hook-form+zod 폼 구조, PATCH 컨벤션 등)을 그대로 재사용하고, 동일한 타입·유틸을 새로 만들지 않는다.

`readFileAsDataURL` 헬퍼를 `FloorplanUploadPage.tsx`에서 `src/lib/file.ts` 같은 공용 위치로 옮겨 `SignupPage`와 공유한다 (중복 제거).

### SignupPage

- react-hook-form + zod, `BuildingFormPage`와 동일한 폼 패턴
- 필드: 이메일, 비밀번호, 비밀번호 확인, 이름, 소속 기관, 담당 건물(자유 텍스트 `Input`), 기관 공문(파일 입력)
- zod: 이메일 형식, 비밀번호 최소 길이, 비밀번호 확인 일치(`refine`), 나머지 필수 텍스트 필드, 파일 필수(`instanceof File`)
- 제출 시: 파일 → `readFileAsDataURL` → `SignupRequest`로 조립 → `useSignup()` 호출
- 성공 시 `/pending`으로 이동 (기존 `PendingApprovalPage`가 이미 "검토 중" 안내를 하고 있음)
- 실패 시(409 등) 폼 하단에 인라인 에러 메시지 — `BuildingFormPage`에서 쓴 것과 동일한 패턴

### AccountApprovalPage

- `usePendingAdmins()`로 목록 조회, `AsyncState`로 로딩/에러/빈 상태(빈 상태: "대기 중인 가입 신청이 없습니다") 처리
- 각 항목: 이름·이메일·소속기관·담당건물·신청일 + "공문 보기"(officialDocUrl을 새 탭으로 여는 링크) + 승인/거절 버튼
- 승인·거절 모두 `ConfirmDialog`로 확인 후 실행 (거절도 되돌리기 어려운 결정이라 삭제와 동일한 수준으로 취급)
- 처리된 항목은 목록에서 바로 사라짐 (react-query invalidate)

### 역할 체크 (최소 버전)

- `useCurrentAdmin()`을 `AdminLayout` 또는 `Sidebar`에서 호출
- `Sidebar`: `role === 'super_admin'`일 때만 "가입 신청 관리" 네비게이션 항목 노출
- 라우팅: `router.tsx`의 `/admin/approvals`를 감싸는 간단한 `RequireSuperAdmin` 래퍼 추가 — 기존 `ProtectedRoute`와 같은 패턴으로, role이 로드됐는데 super_admin이 아니면 `/`로 리다이렉트. 로딩 중에는 잠깐 빈 화면 허용(과설계 방지)

## 에러 처리

- 회원가입 이메일 중복(409) → 인라인 에러 메시지
- 그 외 회원가입/승인/거절 실패 → 일반 에러 메시지, 화면은 유지(사용자가 재시도 가능)
- 목록 조회 실패 → `AsyncState status="error"` + 재시도 버튼(기존 패턴 재사용)

## 테스트

기존 유일한 테스트가 `AsyncState.test.tsx`라 최소한만 추가한다:
- SignupPage: 필수값 미입력 시 제출 막힘, 비밀번호 확인 불일치 시 에러 표시 — 1~2개
- AccountApprovalPage: 승인 버튼 클릭(확인 모달 확인까지) 시 해당 항목이 목록에서 사라짐 — 1개

## 영향받는 파일 요약

**신규**
- `src/features/admin/{types,api,hooks}.ts`
- `src/lib/file.ts` (readFileAsDataURL 이동)
- `src/components/layout/RequireSuperAdmin.tsx` (또는 router.tsx 내 인라인)

**수정**
- `src/pages/auth/SignupPage.tsx` — 스텁 → 실제 폼
- `src/pages/admin/AccountApprovalPage.tsx` — 스텁 → 실제 목록
- `src/pages/floorplan/FloorplanUploadPage.tsx` — `readFileAsDataURL` import로 교체
- `src/mocks/db.ts` — `admins` 추가 + 시드 데이터
- `src/mocks/handlers.ts` — 4개 엔드포인트 추가
- `src/features/auth/types.ts` — `SignupRequest`에 `building`, `officialDocUrl` 추가
- `src/components/layout/Sidebar.tsx`, `src/lib/constants.ts` (NAV_ITEMS) — 조건부 네비 항목
- `src/app/router.tsx` — `/admin/approvals`에 역할 가드 적용
