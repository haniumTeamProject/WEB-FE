# 회원가입 폼 + 가입 신청 관리 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스텁 상태인 `SignupPage`(회원가입 폼)와 `AccountApprovalPage`(가입 신청 관리)를 실제로 동작하게 만든다. 회원가입 시 기관 공문 파일을 첨부해 PENDING 상태 계정을 생성하고, SUPER ADMIN이 목록을 보고 승인/거절할 수 있게 한다.

**Architecture:** 기존 feature-module 패턴(`src/features/<domain>/{types,api,hooks}.ts` + MSW mock)을 그대로 따른다. 새 `features/admin/` 모듈이 계정 승인 관련 API를 담당하고, `features/auth/`는 회원가입 요청 타입만 확장한다. `Admin` 도메인 타입은 `src/types/domain.ts`의 기존 정의를 재사용하며 재정의하지 않는다. 파일 업로드는 `FloorplanUploadPage`와 동일하게 base64 data URL 방식을 쓴다.

**Tech Stack:** React 19, react-hook-form + zod (`@hookform/resolvers/zod`), @tanstack/react-query, axios, MSW(mock), Vitest + Testing Library.

## Global Constraints

- `Admin` / `AdminStatus` / `AdminRole` 타입은 `src/types/domain.ts`에 이미 정의되어 있다 — 재정의 금지, import해서 사용
- 신규 코드는 기존 컨벤션을 따른다: `apiClient`(axios) 기반 `api.ts`, `useQuery`/`useMutation` 기반 `hooks.ts`, react-query 캐시 무효화는 `queryClient.invalidateQueries`
- 로그인이 PENDING/REJECTED 상태를 인식해 분기하는 것은 이번 플랜 범위 밖이다 (별도 작업) — 로그인 mock은 손대지 않는다
- 파일은 base64 data URL로 처리한다 (multipart 아님) — `FloorplanUploadPage`의 `readFileAsDataURL` 패턴 재사용
- 매 태스크 끝에 `npx tsc -b`가 에러 없이 통과해야 한다 (Node는 `PATH="/c/Program Files/nodejs:$PATH"`로 잡아야 함 — 이 worktree의 PATH엔 기본적으로 node가 없음)

---

## Task 1: 파일→data URL 변환 유틸 추출

`FloorplanUploadPage.tsx`에 지역 함수로 있는 `readFileAsDataURL`을 공용 유틸로 뺀다. 회원가입 폼에서도 동일 로직이 필요하기 때문 — 중복 생성 금지 원칙에 따라 하나로 합친다.

**Files:**
- Create: `src/lib/file.ts`
- Create: `src/lib/file.test.ts`
- Modify: `src/pages/floorplan/FloorplanUploadPage.tsx:16-23` (지역 함수 제거, import로 교체)

**Interfaces:**
- Produces: `readFileAsDataURL(file: File): Promise<string>` — 이후 태스크(SignupPage)에서 이 시그니처 그대로 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/file.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { readFileAsDataURL } from './file'

describe('readFileAsDataURL', () => {
  it('resolves a data URL for the given file', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    const result = await readFileAsDataURL(file)

    expect(result).toMatch(/^data:text\/plain;base64,/)
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/lib/file.test.ts`
Expected: FAIL — `Cannot find module './file'` (파일이 아직 없음)

- [ ] **Step 3: 유틸 구현**

`src/lib/file.ts`:
```ts
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/lib/file.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: FloorplanUploadPage가 공용 유틸을 쓰도록 교체**

`src/pages/floorplan/FloorplanUploadPage.tsx` 상단의 지역 함수 정의를 제거:
```diff
-function readFileAsDataURL(file: File): Promise<string> {
-  return new Promise((resolve, reject) => {
-    const reader = new FileReader()
-    reader.onload = () => resolve(reader.result as string)
-    reader.onerror = reject
-    reader.readAsDataURL(file)
-  })
-}
-
 export default function FloorplanUploadPage() {
```

import 목록에 추가:
```diff
 import { AsyncState } from '@/components/ui/AsyncState'
+import { readFileAsDataURL } from '@/lib/file'
```

- [ ] **Step 6: 타입체크로 회귀 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc -b`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add src/lib/file.ts src/lib/file.test.ts src/pages/floorplan/FloorplanUploadPage.tsx
git commit -m "refactor: 파일→data URL 변환 유틸을 공용으로 분리"
```

---

## Task 2: 타입 확장 (SignupRequest, 승인 관련 요청 타입, ConfirmDialog 스타일 옵션)

런타임 로직 없는 순수 타입/소품 확장. `tsc -b`로 검증한다.

**Files:**
- Modify: `src/features/auth/types.ts`
- Create: `src/features/admin/types.ts`
- Modify: `src/components/ui/ConfirmDialog.tsx`

**Interfaces:**
- Produces: `SignupRequest`(확장됨), `UpdateAdminStatusInput`, `ConfirmDialog`의 `confirmVariant?: 'danger' | 'primary'` prop

- [ ] **Step 1: `SignupRequest`에 필드 추가**

`src/features/auth/types.ts` 전체를 다음으로 교체:
```ts
export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
}

export interface SignupRequest {
  email: string
  password: string
  name: string
  org: string // 소속 기관
  building: string // 담당 건물
  officialDocUrl: string // 기관 공문(직인) — base64 data URL
}
```

- [ ] **Step 2: `features/admin/types.ts` 작성**

`Admin` 타입은 재정의하지 않고 필요한 곳에서 `@/types/domain`으로부터 직접 import한다. 이 파일엔 요청 전용 타입만 둔다.

`src/features/admin/types.ts`:
```ts
export interface UpdateAdminStatusInput {
  status: 'active' | 'rejected'
}
```

- [ ] **Step 3: `ConfirmDialog`에 `confirmVariant` prop 추가 (기존 동작 불변)**

`src/components/ui/ConfirmDialog.tsx` 전체를 다음으로 교체 (기본값이 기존 `'danger'`와 동일해 기존 6곳의 호출부는 변경 없이 그대로 동작):
```tsx
import { Button } from './Button'
import { Modal } from './Modal'

// 삭제 등 되돌릴 수 없는 작업 전에 공통으로 쓰는 확인 모달.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '삭제',
  cancelLabel = '취소',
  confirmVariant = 'danger',
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'danger' | 'primary'
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {description && <p className="text-muted">{description}</p>}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
        <Button variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={confirmVariant} disabled={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: 타입체크**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc -b`
Expected: 에러 없음 (아직 `SignupRequest`를 쓰는 `signup()` 함수는 구조적 타이핑으로 통과하지만, `building`/`officialDocUrl` 없이 호출하는 곳이 있다면 여기서 잡힘 — 현재 `SignupPage`가 스텁이라 호출부가 없으므로 통과해야 함)

- [ ] **Step 5: 커밋**

```bash
git add src/features/auth/types.ts src/features/admin/types.ts src/components/ui/ConfirmDialog.tsx
git commit -m "feat: 회원가입 요청 타입 확장 및 ConfirmDialog에 confirmVariant 추가"
```

---

## Task 3: Mock 백엔드 — 계정 데이터 + 4개 엔드포인트

**Files:**
- Modify: `src/mocks/db.ts`
- Modify: `src/mocks/handlers.ts`

**Interfaces:**
- Consumes: `Admin`, `AdminStatus`, `AdminRole` (from `@/types/domain`)
- Produces: mock 엔드포인트 4개 — `POST /admin/auth/signup`(실제 동작), `GET /admin/me`, `GET /admin/accounts?status=`, `PATCH /admin/accounts/:id`. 이후 Task 4의 `features/admin/api.ts`가 이 엔드포인트들을 호출

- [ ] **Step 1: `db.ts`에 `admins` 배열 + 시드 데이터 추가**

`src/mocks/db.ts` 최상단 import 라인을 교체:
```diff
-import type { Beacon, Building, Connector, Floor, Floorplan, Landmark } from '@/types/domain'
+import type { Admin, Beacon, Building, Connector, Floor, Floorplan, Landmark } from '@/types/domain'
```

샘플 설계도 SVG 정의(`sampleFloorplan`) 바로 아래에 샘플 공문 SVG를 추가:
```ts
// 샘플 기관 공문 (승인 관리 화면에서 "공문 보기" 클릭 시 열람용 데모 문서)
const sampleOfficialDoc =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
      <rect width="600" height="800" fill="#ffffff" stroke="#d1d5db"/>
      <text x="60" y="100" font-size="28" fill="#1f2937">공 문</text>
      <text x="60" y="160" font-size="16" fill="#4b5563">수신: 한이음 프로젝트팀</text>
      <text x="60" y="190" font-size="16" fill="#4b5563">제목: 관리자 계정 발급 요청</text>
      <circle cx="480" cy="700" r="50" fill="none" stroke="#dc2626" stroke-width="3"/>
      <text x="450" y="705" font-size="14" fill="#dc2626">직인</text>
    </svg>`,
  )
```

`db` 객체의 타입 선언과 값 모두에 `admins` 추가:
```diff
 export const db: {
   buildings: Building[]
   floors: Record<string, Floor[]>
   connectors: Record<string, Connector[]>
   floorplans: Record<string, Floorplan>
   masks: Record<string, unknown>
   beacons: Record<string, Beacon[]>
   landmarks: Record<string, Landmark[]>
+  admins: Admin[]
 } = {
```

`db` 리터럴의 마지막(`landmarks: {...},` 다음)에 추가:
```ts
  admins: [
    {
      id: 'admin_super',
      email: 'super@haniumteam.org',
      name: '슈퍼관리자',
      org: '한이음 프로젝트팀',
      building: '전체',
      status: 'active',
      role: 'super_admin',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'admin_pending_1',
      email: 'kim@suwon.ac.kr',
      name: '김민지',
      org: '수원대학교 ICT융합대학',
      building: 'ICT융합대학 4층',
      status: 'pending',
      role: 'admin',
      officialDocUrl: sampleOfficialDoc,
      createdAt: '2026-08-09T09:00:00.000Z',
    },
    {
      id: 'admin_pending_2',
      email: 'lee@ku.ac.kr',
      name: '이준호',
      org: '고려대 세종캠퍼스',
      building: '경상대학',
      status: 'pending',
      role: 'admin',
      officialDocUrl: sampleOfficialDoc,
      createdAt: '2026-08-10T14:30:00.000Z',
    },
  ],
```

- [ ] **Step 2: `handlers.ts`에 4개 엔드포인트 추가**

`src/mocks/handlers.ts` 상단 import에 `Admin` 추가:
```diff
-import type { Beacon, BeaconType, Building, Connector, Floor, Landmark, LandmarkType } from '@/types/domain'
+import type { Admin, Beacon, BeaconType, Building, Connector, Floor, Landmark, LandmarkType } from '@/types/domain'
```

`// ---- 인증 ----` 섹션을 아래로 교체 (기존 `login`/`signup` 스텁 두 줄을 대체):
```ts
  // ---- 인증 ----
  http.post(`${base}/admin/auth/login`, () => HttpResponse.json({ accessToken: 'mock-token' })),

  http.post(`${base}/admin/auth/signup`, async ({ request }) => {
    const body = (await request.json()) as {
      email: string
      password: string
      name: string
      org: string
      building: string
      officialDocUrl: string
    }
    if (db.admins.some((a) => a.email === body.email)) {
      return new HttpResponse(null, { status: 409 })
    }
    const admin: Admin = {
      id: nextId('admin'),
      email: body.email,
      name: body.name,
      org: body.org,
      building: body.building,
      status: 'pending',
      role: 'admin',
      officialDocUrl: body.officialDocUrl,
      createdAt: new Date().toISOString(),
    }
    db.admins.push(admin)
    return new HttpResponse(null, { status: 201 })
  }),

  http.get(`${base}/admin/me`, () => {
    const superAdmin = db.admins.find((a) => a.role === 'super_admin')
    return superAdmin ? HttpResponse.json(superAdmin) : new HttpResponse(null, { status: 404 })
  }),

  http.get(`${base}/admin/accounts`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const list = status ? db.admins.filter((a) => a.status === status) : db.admins
    const sorted = [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    return HttpResponse.json(sorted)
  }),

  http.patch(`${base}/admin/accounts/:id`, async ({ params, request }) => {
    const admin = db.admins.find((a) => a.id === params.id)
    if (!admin) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { status: 'active' | 'rejected' }
    admin.status = body.status
    return HttpResponse.json(admin)
  }),
```

- [ ] **Step 3: 타입체크**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc -b`
Expected: 에러 없음

- [ ] **Step 4: 기존 테스트 회귀 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: 기존 테스트(AsyncState 2개, file.ts 1개) 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/mocks/db.ts src/mocks/handlers.ts
git commit -m "feat: 계정 승인 관련 mock 데이터/엔드포인트 추가"
```

---

## Task 4: `features/admin/` API + 훅

**Files:**
- Create: `src/features/admin/api.ts`
- Create: `src/features/admin/hooks.ts`

**Interfaces:**
- Consumes: Task 2의 `UpdateAdminStatusInput`, Task 3의 mock 엔드포인트
- Produces: `usePendingAdmins()`, `useApproveAdmin()`, `useRejectAdmin()`, `useCurrentAdmin()` — Task 6(AccountApprovalPage), Task 7(Sidebar/RequireSuperAdmin)에서 그대로 사용

- [ ] **Step 1: `api.ts` 작성**

`src/features/admin/api.ts`:
```ts
import { apiClient } from '@/lib/apiClient'
import type { Admin } from '@/types/domain'
import type { UpdateAdminStatusInput } from './types'

export async function fetchPendingAdmins(): Promise<Admin[]> {
  const { data } = await apiClient.get<Admin[]>('/admin/accounts', {
    params: { status: 'pending' },
  })
  return data
}

export async function updateAdminStatus(id: string, input: UpdateAdminStatusInput): Promise<Admin> {
  const { data } = await apiClient.patch<Admin>(`/admin/accounts/${id}`, input)
  return data
}

export async function fetchCurrentAdmin(): Promise<Admin> {
  const { data } = await apiClient.get<Admin>('/admin/me')
  return data
}
```

- [ ] **Step 2: `hooks.ts` 작성**

`src/features/admin/hooks.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCurrentAdmin, fetchPendingAdmins, updateAdminStatus } from './api'

const pendingKey = ['admin', 'accounts', 'pending']

export function usePendingAdmins() {
  return useQuery({ queryKey: pendingKey, queryFn: fetchPendingAdmins })
}

export function useApproveAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => updateAdminStatus(id, { status: 'active' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pendingKey }),
  })
}

export function useRejectAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => updateAdminStatus(id, { status: 'rejected' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pendingKey }),
  })
}

export function useCurrentAdmin() {
  return useQuery({ queryKey: ['admin', 'me'], queryFn: fetchCurrentAdmin })
}
```

- [ ] **Step 3: 타입체크**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc -b`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/features/admin/api.ts src/features/admin/hooks.ts
git commit -m "feat: 가입 승인 관련 API·훅 추가 (features/admin)"
```

(이 계층은 다른 feature의 `api.ts`/`hooks.ts`와 동일하게 얇은 래퍼라 기존 코드베이스 컨벤션대로 별도 단위테스트를 두지 않는다 — `connectors`, `floorplan` 등 다른 feature도 동일)

---

## Task 5: SignupPage 구현

**Files:**
- Modify: `src/pages/auth/SignupPage.tsx`
- Create: `src/pages/auth/SignupPage.test.tsx`

**Interfaces:**
- Consumes: `useSignup()`(기존, `src/features/auth/hooks.ts`), `readFileAsDataURL`(Task 1), `Input`/`Button`(기존 UI 컴포넌트)
- Produces: 없음 (leaf page)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/pages/auth/SignupPage.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import SignupPage from './SignupPage'

const mutateMock = vi.fn()
vi.mock('@/features/auth/hooks', () => ({
  useSignup: () => ({ mutate: mutateMock, isPending: false }),
}))

describe('SignupPage', () => {
  it('shows a validation error and does not submit when required fields are empty', async () => {
    const user = userEvent.setup()
    render(<SignupPage />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: '가입 신청' }))

    expect(await screen.findByText('이메일을 입력하세요')).toBeVisible()
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('shows an error when password confirmation does not match', async () => {
    const user = userEvent.setup()
    render(<SignupPage />, { wrapper: MemoryRouter })

    await user.type(screen.getByLabelText('이메일'), 'admin@ac.kr')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'different123')
    await user.type(screen.getByLabelText('이름'), '홍길동')
    await user.type(screen.getByLabelText('소속 기관'), '수원대학교')
    await user.type(screen.getByLabelText('담당 건물'), 'ICT융합대학')
    await user.click(screen.getByRole('button', { name: '가입 신청' }))

    expect(await screen.findByText('비밀번호가 일치하지 않습니다')).toBeVisible()
    expect(mutateMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/pages/auth/SignupPage.test.tsx`
Expected: FAIL — 현재 스텁 페이지엔 "가입 신청" 버튼도, 이메일/비밀번호 필드도 없어서 `getByRole`/`getByLabelText`가 못 찾음

- [ ] **Step 3: `SignupPage` 구현**

`src/pages/auth/SignupPage.tsx` 전체를 다음으로 교체:
```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useSignup } from '@/features/auth/hooks'
import { readFileAsDataURL } from '@/lib/file'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

const schema = z
  .object({
    email: z.string().min(1, '이메일을 입력하세요').email('올바른 이메일 형식이 아닙니다'),
    password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
    passwordConfirm: z.string().min(1, '비밀번호를 다시 입력하세요'),
    name: z.string().min(1, '이름을 입력하세요'),
    org: z.string().min(1, '소속 기관을 입력하세요'),
    building: z.string().min(1, '담당 건물을 입력하세요'),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: '비밀번호가 일치하지 않습니다',
    path: ['passwordConfirm'],
  })
type FormValues = z.infer<typeof schema>

export default function SignupPage() {
  const navigate = useNavigate()
  const signup = useSignup()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [submitError, setSubmitError] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setSubmitError(false)
    if (!file) {
      setFileError('기관 공문 파일을 첨부하세요')
      return
    }
    setFileError('')
    const officialDocUrl = await readFileAsDataURL(file)
    signup.mutate(
      {
        email: values.email,
        password: values.password,
        name: values.name,
        org: values.org,
        building: values.building,
        officialDocUrl,
      },
      {
        onSuccess: () => navigate('/pending'),
        onError: () => setSubmitError(true),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ textAlign: 'center', margin: 0 }}>계정 생성</h1>
      <Input label="이메일" placeholder="admin@ac.kr" error={errors.email?.message} {...register('email')} />
      <Input
        label="비밀번호"
        type="password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Input
        label="비밀번호 확인"
        type="password"
        error={errors.passwordConfirm?.message}
        {...register('passwordConfirm')}
      />
      <Input label="이름" error={errors.name?.message} {...register('name')} />
      <Input
        label="소속 기관"
        placeholder="수원대학교 ICT융합대학"
        error={errors.org?.message}
        {...register('org')}
      />
      <Input
        label="담당 건물"
        placeholder="ICT융합대학"
        error={errors.building?.message}
        {...register('building')}
      />
      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: 13, color: '#8C99B3', marginBottom: 8 }}>
          기관 공문(직인 포함)
        </span>
        <input
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {fileError && (
          <span style={{ display: 'block', color: '#DC4C4C', fontSize: 12, marginTop: 4 }}>
            {fileError}
          </span>
        )}
      </label>
      {submitError && (
        <span style={{ color: '#DC4C4C', fontSize: 13 }}>
          가입 신청에 실패했습니다. 이미 등록된 이메일인지 확인해 주세요.
        </span>
      )}
      <Button type="submit" disabled={signup.isPending}>
        {signup.isPending ? '제출 중…' : '가입 신청'}
      </Button>
      <p style={{ textAlign: 'center', fontSize: 14 }}>
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </form>
  )
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/pages/auth/SignupPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 타입체크**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc -b`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/pages/auth/SignupPage.tsx src/pages/auth/SignupPage.test.tsx
git commit -m "feat: 회원가입 폼 구현"
```

---

## Task 6: AccountApprovalPage 구현

**Files:**
- Modify: `src/pages/admin/AccountApprovalPage.tsx`
- Create: `src/pages/admin/AccountApprovalPage.test.tsx`

**Interfaces:**
- Consumes: `usePendingAdmins`, `useApproveAdmin`, `useRejectAdmin`(Task 4), `Admin`(from `@/types/domain`), `AsyncState`, `ConfirmDialog`(with `confirmVariant`, Task 2), `Card`, `Button`, `Breadcrumb`(기존)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/pages/admin/AccountApprovalPage.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AccountApprovalPage from './AccountApprovalPage'
import type { Admin } from '@/types/domain'

const sampleAdmin: Admin = {
  id: 'admin_1',
  email: 'kim@suwon.ac.kr',
  name: '김민지',
  org: '수원대학교',
  building: 'ICT융합대학',
  status: 'pending',
  role: 'admin',
  officialDocUrl: 'data:text/plain;base64,AA==',
  createdAt: '2026-08-09T09:00:00.000Z',
}

const approveMutate = vi.fn(
  (_id: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
)
vi.mock('@/features/admin/hooks', () => ({
  usePendingAdmins: () => ({ data: [sampleAdmin], isLoading: false, isError: false, refetch: vi.fn() }),
  useApproveAdmin: () => ({ mutate: approveMutate, isPending: false }),
  useRejectAdmin: () => ({ mutate: vi.fn(), isPending: false }),
}))

describe('AccountApprovalPage', () => {
  it('confirms and approves a pending admin', async () => {
    const user = userEvent.setup()
    render(<AccountApprovalPage />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: '승인' }))
    const confirmButtons = screen.getAllByRole('button', { name: '승인' })
    await user.click(confirmButtons[confirmButtons.length - 1])

    expect(approveMutate).toHaveBeenCalledWith('admin_1', expect.objectContaining({ onSuccess: expect.any(Function) }))
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/pages/admin/AccountApprovalPage.test.tsx`
Expected: FAIL — 현재 스텁 페이지엔 "승인" 버튼이 없음

- [ ] **Step 3: `AccountApprovalPage` 구현**

`src/pages/admin/AccountApprovalPage.tsx` 전체를 다음으로 교체:
```tsx
import { useState } from 'react'
import { useApproveAdmin, usePendingAdmins, useRejectAdmin } from '@/features/admin/hooks'
import type { Admin } from '@/types/domain'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { AsyncState } from '@/components/ui/AsyncState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

type PendingAction = { admin: Admin; type: 'approve' | 'reject' }

export default function AccountApprovalPage() {
  const { data: admins, isLoading, isError, refetch } = usePendingAdmins()
  const approve = useApproveAdmin()
  const reject = useRejectAdmin()
  const [action, setAction] = useState<PendingAction | null>(null)

  function runAction() {
    if (!action) return
    const mutation = action.type === 'approve' ? approve : reject
    mutation.mutate(action.admin.id, { onSuccess: () => setAction(null) })
  }

  return (
    <div>
      <Breadcrumb items={[{ label: '홈', to: '/' }, { label: '가입 신청 관리' }]} />
      <h1>가입 신청 관리</h1>

      {isLoading && <AsyncState status="loading" />}
      {isError && <AsyncState status="error" onRetry={() => refetch()} />}

      <div className="grid gap-3 mt-4">
        {!isLoading &&
          !isError &&
          admins?.map((admin) => (
            <Card key={admin.id} className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-ink">
                  {admin.name} · {admin.email}
                </div>
                <div className="text-[13px] text-muted">
                  {admin.org}
                  {admin.building && ` · ${admin.building}`}
                  {admin.createdAt && ` · ${new Date(admin.createdAt).toLocaleDateString('ko-KR')} 신청`}
                </div>
                {admin.officialDocUrl && (
                  <a
                    href={admin.officialDocUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand text-[13px]"
                  >
                    공문 보기
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setAction({ admin, type: 'approve' })}>승인</Button>
                <Button variant="danger" onClick={() => setAction({ admin, type: 'reject' })}>
                  거절
                </Button>
              </div>
            </Card>
          ))}
        {admins && admins.length === 0 && (
          <AsyncState status="empty" title="대기 중인 가입 신청이 없습니다." />
        )}
      </div>

      <ConfirmDialog
        open={!!action}
        title={action?.type === 'approve' ? '가입을 승인할까요?' : '가입을 거절할까요?'}
        description={action ? `'${action.admin.name}' (${action.admin.email})` : undefined}
        confirmLabel={action?.type === 'approve' ? '승인' : '거절'}
        confirmVariant={action?.type === 'approve' ? 'primary' : 'danger'}
        pending={approve.isPending || reject.isPending}
        onCancel={() => setAction(null)}
        onConfirm={runAction}
      />
    </div>
  )
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/pages/admin/AccountApprovalPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: 타입체크**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc -b`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/pages/admin/AccountApprovalPage.tsx src/pages/admin/AccountApprovalPage.test.tsx
git commit -m "feat: 가입 신청 관리 페이지 구현"
```

---

## Task 7: 역할 기반 네비게이션/라우트 가드

설계 문서는 `src/lib/constants.ts`의 `NAV_ITEMS`도 수정 대상으로 언급했지만, 플래닝 중 확인해보니 `Sidebar.tsx`는 `NAV_ITEMS`를 참조하지 않고 자체 지역 배열(`items`)을 쓴다 — `NAV_ITEMS`는 어디에서도 import되지 않는 죽은 코드다. 이번 작업과 무관한 기존 이슈라 손대지 않고, 실제로 렌더링되는 `Sidebar.tsx`의 지역 배열만 수정한다.

**Files:**
- Create: `src/components/layout/RequireSuperAdmin.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `useCurrentAdmin()`(Task 4)

- [ ] **Step 1: `RequireSuperAdmin` 작성**

`src/components/layout/RequireSuperAdmin.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useCurrentAdmin } from '@/features/admin/hooks'

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { data: admin, isLoading } = useCurrentAdmin()
  if (isLoading) return null
  if (admin?.role !== 'super_admin') return <Navigate to="/" replace />
  return <>{children}</>
}
```

- [ ] **Step 2: 라우트에 가드 적용**

`src/app/router.tsx`에서 import 추가:
```diff
 import AccountApprovalPage from '@/pages/admin/AccountApprovalPage'
+import { RequireSuperAdmin } from '@/components/layout/RequireSuperAdmin'
```

`/admin/approvals` 라우트를 감싸도록 교체:
```diff
-      { path: '/admin/approvals', element: <AccountApprovalPage /> },
+      {
+        path: '/admin/approvals',
+        element: (
+          <RequireSuperAdmin>
+            <AccountApprovalPage />
+          </RequireSuperAdmin>
+        ),
+      },
```

- [ ] **Step 3: Sidebar에 조건부 네비 항목 추가**

`src/components/layout/Sidebar.tsx` 전체를 다음으로 교체:
```tsx
import { NavLink } from 'react-router-dom'
import { useCurrentAdmin } from '@/features/admin/hooks'

const items = [
  { to: '/', label: '대시보드', end: true },
  { to: '/buildings', label: '건물 관리', end: false },
  { to: '/guidelines', label: '설치 가이드라인', end: false },
]
const bottom = [
  { to: '/settings', label: '설정' },
  { to: '/account', label: '계정' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'block mx-4 px-6 py-3.5 rounded-[10px] text-[15px] font-semibold',
    isActive ? 'bg-brand text-white' : 'text-[#2E3648] hover:bg-gray-50',
  ].join(' ')

export function Sidebar() {
  const { data: admin } = useCurrentAdmin()

  return (
    <nav className="w-60 min-h-screen border-r border-line pt-6 bg-white">
      <div className="px-6 pb-6 text-[22px] font-extrabold text-brand">Mappin</div>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={linkClass}>
          {it.label}
        </NavLink>
      ))}
      {admin?.role === 'super_admin' && (
        <NavLink to="/admin/approvals" className={linkClass}>
          가입 신청 관리
        </NavLink>
      )}
      <hr className="mx-6 my-4 border-line" />
      {bottom.map((it) => (
        <NavLink key={it.to} to={it.to} className={linkClass}>
          {it.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 4: 타입체크 + 전체 테스트**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc -b && npx vitest run`
Expected: 둘 다 에러 없음 / 전체 테스트 PASS (AsyncState 2 + file 1 + SignupPage 2 + AccountApprovalPage 1 = 총 6개)

- [ ] **Step 5: eslint 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx eslint .`
Expected: 이번 작업으로 새로 추가된 에러 없음 (기존에 있던 `MapReviewPage.tsx`의 무해한 warning 2개, `mockServiceWorker.js` warning 1개는 이 플랜과 무관하니 무시)

- [ ] **Step 6: 커밋**

```bash
git add src/components/layout/RequireSuperAdmin.tsx src/app/router.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: 가입 신청 관리 페이지에 super_admin 역할 가드 적용"
```

---

## Task 8: 수동 브라우저 검증 (자동 테스트 범위 밖)

Mock 핸들러(Task 3)는 이 저장소에 MSW-node 테스트 인프라가 없어 자동 테스트로 커버되지 않는다 — 실제 dev 서버로 end-to-end 확인한다.

- [ ] **Step 1: dev 서버 기동 후 회원가입 흐름 확인**

`/signup`에서 폼 작성(이메일은 `db.admins`에 없는 새 값으로) + 파일 첨부 후 제출 → `/pending`으로 이동하는지 확인. 이미 존재하는 이메일(`kim@suwon.ac.kr`)로 다시 시도 → 인라인 에러 문구가 뜨는지 확인.

- [ ] **Step 2: 가입 신청 관리 흐름 확인**

`/admin/approvals`로 이동 → 시드된 PENDING 2건(김민지, 이준호)이 보이는지, "공문 보기" 클릭 시 새 탭에서 문서(SVG)가 열리는지 확인. 승인 클릭 → 확인 모달(파란 승인 버튼) → 확인 시 목록에서 사라지는지 확인. 나머지 하나는 거절로 같은 방식 확인.

- [ ] **Step 3: 사이드바 노출 확인**

현재 mock `/admin/me`가 항상 super_admin을 반환하므로, 사이드바에 "가입 신청 관리" 링크가 보여야 한다. (역할 체크 자체를 확인하려면 `db.ts`의 시드 super_admin의 `role`을 임시로 `'admin'`으로 바꿔 링크가 사라지는지, `/admin/approvals` 직접 접근 시 `/`로 리다이렉트되는지 확인 후 원복 — 코드에 반영하지 않고 로컬 확인용으로만)

- [ ] **Step 4: 콘솔 에러 없는지 확인**

브라우저 콘솔에 새로 추가된 에러가 없는지 확인 (`preview_logs`, `read_console_messages`).
