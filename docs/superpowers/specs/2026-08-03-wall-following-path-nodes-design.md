# 벽 경계 기반 경로 노드 생성 — 설계

## 배경

관리자 웹(`WEB-FE`)의 지도 검수 화면([MapReviewPage.tsx](../../../src/pages/map-editor/MapReviewPage.tsx))에는
현재 통행영역 채우기/벽 그리기/지우개 도구만 있고, 경로 노드를 생성하는 기능 자체가 없다.
(저장소 조사 결과 확인 — 다른 브랜치에도 관련 로직 없음.)

채연이 별도로 만든 참고 구현(`map_inspection.html`, 첨부 파일)에는 이미 검증된 "벽 경계를 따라가는"
방식의 노드 생성 로직이 들어있다: 통행영역 마스크의 연결요소 경계를 추적하고, 단순화하고,
convex/concave(벽 끝)로 분류해서 노드로 만드는 방식. 이번 작업은 이 로직을 `WEB-FE`에 이식하는 것이다.

## 범위

- **포함**: 벽 경계 추적 기반 노드 생성 + 경계를 따라 인접 노드를 잇는 엣지 표시
- **제외** (이번 스펙 밖):
  - 복도 폭이 좁을 때 건너뛰는 크로싱 엣지 (Step 3/4, 참고 파일 기준)
  - 축척(m/px) 입력, 모서리 단순화 정도 입력 등 부가 UI
  - 노드 데이터의 서버 저장/영속화 (현재 `/floors/:id/mask` 외 관련 API 없음)
  - 랜드마크, 비콘, A* 경로 테스트 UI (기존 다른 페이지에서 별도로 다룸)

## 아키텍처

### 1. 새 로직 모듈 — `src/features/mapEditor/pathNodes.ts`

순수 함수로 분리 (UI와 무관, 테스트하기 쉬운 형태).

```ts
export interface PathNode {
  id: string
  x: number
  y: number
  type: 'corner'
  concave: boolean // true = 벽이 끝나는 지점(움푹 들어간 모서리)
}

export interface PathEdge {
  a: string
  b: string
  type: 'wall'
}

export function generatePathNodes(
  mask: Uint8Array, // 1 = 통행 가능(walkable), 0 = 아님 — walkableRef와 동일한 shape
  w: number,
  h: number,
): { nodes: PathNode[]; edges: PathEdge[] }
```

내부적으로 `map_inspection.html`의 알고리즘을 이식:

- `labelComponents(mask, w, h)` — flood-fill 기반 연결요소 라벨링. `MIN_COMPONENT_PIXELS = 25`
  미만인 요소는 노이즈로 보고 건너뜀.
- `traceBoundary(mask, w, h, labels, compId, startX, startY)` — Moore-neighbor 경계 추적으로
  해당 연결요소의 외곽 경계를 픽셀 단위로 순서대로 추출.
- `simplify(points, epsilon)` — Douglas-Peucker 단순화. `SIMPLIFY_EPSILON_PX = 3` (고정값,
  참고 파일과 달리 축척 입력이 없으므로 캔버스 픽셀 기준 고정 상수 사용).
- 단순화된 정점 배열을 순회하며 각 정점의 turn 방향(cross product)으로 convex/concave 분류.
  concave(cross < 0)면 `concave: true` — 벽이 물리적으로 끝나는 지점.
- 각 연결요소의 정점들을 `corner` 타입 노드로 등록하고, 경계 루프를 따라 인접한 노드끼리
  무방향 `wall` 엣지로 연결(폐루프이므로 마지막 노드는 첫 노드로 되돌아감).

축척 관련 로직(m 단위 거리 계산, 크로싱 엣지, subdivide 등)은 이식하지 않는다 — 이번 범위는
노드 좌표/표시 방식만 바꾸는 것이므로 픽셀 좌표만 다룬다.

### 2. `MapReviewPage.tsx` 통합

기존 파일은 React state보다 `useRef` + 수동 `redraw()` 호출 위주의 imperative 스타일을 쓰고 있음
(`walkableRef`, `barrierRef`, `historyRef` 등) — 같은 패턴을 따른다.

- `pathNodesRef = useRef<PathNode[]>([])`, `pathEdgesRef = useRef<PathEdge[]>([])` 추가
- 도구 패널에 "경로 노드 설치" 버튼 추가 (이미지 없으면 disabled, 기존 저장 버튼과 같은 스타일).
  클릭 시 `generatePathNodes(walkableRef.current, dims.w, dims.h)` 호출 → 결과를 ref에 저장 →
  `redraw()`.
- `redraw()` 함수 확장: 기존 base+mask 이미지를 그린 뒤,
  - `wall` 엣지: 얇은 보라색(`#7c3aed`) 선으로 두 노드를 연결
  - `corner` 노드(`concave: false`): 보라색(`#7c3aed`) 원
  - `concave` 노드: 분홍색(`#db2777`) 원 (벽 끝 지점 강조)
  - 참고 파일의 범례 색상과 동일하게 맞춰서, 나중에 크로싱 엣지 등을 추가할 때 시각적 일관성 유지.
- 마스크를 바꾸는 모든 동작(`flood`, `stampDisc`/`stampLine`을 통한 벽 그리기, `undo`, `clearAll`,
  새 이미지 업로드)에서 `pathNodesRef`/`pathEdgesRef`를 비워서 무효화 — 마스크와 어긋난 stale
  노드가 화면에 남지 않게 한다. (참고 파일의 `invalidatePathNodes` 패턴과 동일한 의도.)
- `onSave()`는 변경하지 않음 — 노드 데이터 저장은 이번 범위 밖.

## 데이터 흐름

```
walkableRef (Uint8Array, 사용자가 채우기/벽/지우개로 편집)
   → [경로 노드 설치] 클릭
   → generatePathNodes(mask, w, h)
   → pathNodesRef / pathEdgesRef
   → redraw() 가 canvas 위에 base + mask + 노드/엣지 오버레이를 그림
```

## 테스트 계획

`package.json` 확인 결과 자동 테스트 프레임워크가 구성되어 있지 않으므로, 브라우저 수동 검증으로
확인한다:

1. 평면도 이미지 업로드
2. "영역 채우기"로 오목한 모서리(예: 기둥이나 파티션 끝)가 있는 ㄱ자/ㄴ자 복도 형태를 칠함
3. "경로 노드 설치" 클릭
4. 노드가 복도 중앙이 아니라 **벽 경계선 위**에 찍히는지 확인
5. 벽이 끝나는 지점(concave)이 분홍색으로 구분되는지 확인
6. 이후 벽 그리기/지우개로 마스크를 바꾸면 이전 노드가 사라지는지(무효화) 확인
