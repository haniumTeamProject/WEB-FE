# WEB-FE

한이음 프로젝트 6팀 — 시각장애인을 위한 BLE 비콘 기반 실내 음성 길 안내 시스템의 **프론트엔드** 레포지토리입니다.

## 기술 스택

- **React** + **TypeScript**
- **Vite** (빌드 도구)
- **Tailwind CSS**
- **React Query** + **Axios** (서버 통신)
- **React Hook Form** + **Zod** (폼 유효성 검사)
- **React Router** (라우팅)

## 시작하기

Node.js 18 이상이 필요합니다.

```bash
git clone https://github.com/haniumTeamProject/WEB-FE.git
cd WEB-FE
npm install
npm run dev
```

개발 서버가 실행되면 `http://localhost:5173` 에서 확인할 수 있습니다.

## 주요 명령어

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run lint` | ESLint 검사 |
| `npm run preview` | 빌드 결과 미리보기 |

## 프로젝트 구조

```
src/
├── components/   # 공통 컴포넌트
├── pages/        # 페이지 단위 컴포넌트
├── hooks/        # 커스텀 훅
├── api/          # API 호출 함수
├── types/        # TypeScript 타입 정의
└── utils/        # 유틸리티 함수
```