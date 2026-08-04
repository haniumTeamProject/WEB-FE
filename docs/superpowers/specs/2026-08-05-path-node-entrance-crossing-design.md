# 경로노드 — 입구·맞은편·횡단 엣지 확장 설계

## 배경

[벽 경계 기반 경로 노드 생성 설계](2026-08-03-wall-following-path-nodes-design.md)에서 구현한
`generatePathNodes`는 통행영역 마스크의 벽 경계만 보고 코너(corner)/오목(concave) 노드를 찍는다.
정책 5.3(지도 검수 정책)의 원문은 다음을 요구한다:

> 수직 연결자 입구 · 복도 꼭짓점 · 랜드마크 출입구 · 위 셋과 **마주보는 지점**에 경로노드를 둔다.
> **벽을 따라 이동**하되, 복도가 짧으면 **마주보는 노드로 횡단**한다.

"복도 꼭짓점"은 이미 구현됨. 이번 작업은 나머지 세 가지 — **연결자 입구 / 랜드마크 출입구 / 그
맞은편 지점** — 를 추가하고, 맞은편 지점과의 거리가 가까우면 **횡단(cross) 엣지**를 만드는 것이다.

## 범위

- **포함**: 연결자 비콘·랜드마크 좌표를 입구 후보로 사용해 경계에 스냅 → 맞은편 지점 탐색 →
  노드/엣지 삽입 → 횡단 엣지 생성. 새 노드 타입에 대한 캔버스 시각화(색상 구분 + 범례).
- **제외** (이번 스펙 밖, [이전 설계 문서](2026-08-03-wall-following-path-nodes-design.md)와 동일):
  - 축척(m/px) — 모든 거리·임계값은 캔버스 픽셀 기준
  - 노드/엣지의 서버 저장(영속화)
  - A* 경로 탐색 연동
  - `corner`/`wall` 생성 로직 자체의 리팩터링(최대한 그대로 두고 추가만 한다)

## 아키텍처

### 1. 데이터 흐름 — `MapReviewPage.tsx`

```
useBeacons(floorId)   → type==='connector' 인 것만 필터 → 연결자 입구 후보
useLandmarks(floorId) → 전부 → 랜드마크 출입구 후보
   ↓ (좌표 변환: 비콘/랜드마크는 900px 기준 좌표계 — FloorMapCanvas.DESIGN_W)
   scale = dims.w / 900
   canvasX = raw.x * scale, canvasY = raw.y * scale
   ↓
entrances: EntrancePoint[] = [{ x, y, kind: 'connector' | 'landmark' }, ...]
   ↓ ("경로 노드 설치" 클릭 시)
generatePathNodes(effectiveMask, dims.w, dims.h, entrances)
```

`x`/`y`가 없는(아직 지도에 배치 안 된) 비콘·랜드마크는 애초에 후보에서 제외한다.
연결자·랜드마크가 하나도 없으면 `entrances = []`이고, 이 경우 결과는 **기존 동작과 100% 동일**
(코너 노드만 생성) — 지도 검수가 비콘/랜드마크 등록보다 먼저 이뤄지는 일반적인 순서를 고려한
하위 호환이다. 이 버튼은 저장하지 않는 미리보기이므로, 비콘/랜드마크를 나중에 등록한 뒤 같은
화면에서 다시 클릭하면 그때 입구 노드가 반영된다.

### 2. `pathNodes.ts` 알고리즘 확장

기존 순서(라벨링 → 경계 추적 → Douglas-Peucker 단순화 → convex/concave 분류 → 루프 엣지 생성)는
**그대로 둔다.** 각 연결 요소(component)에 대해 단순화된 코너 루프를 만든 **다음 단계**로 아래를
추가한다.

각 입구 후보 `E`에 대해:

1. **스냅**: 해당 컴포넌트의 원본(비단순화) 경계 폴리라인에서 `E`와 가장 가까운 점 `S`를 구한다
   (모든 경계 선분에 수선의 발을 내려 최소 거리 선택 — 기존 `perpendicularDistance` 재사용).
   `distance(E, S) > MAX_SNAP_PX(30)`이면 **이 입구는 버린다** — 비콘 좌표가 아직 칠해진
   통행영역과 동떨어져 있다는 뜻이므로 억지로 스냅하지 않는다. `console.warn`으로
   `[pathNodes] entrance snap skipped (too far): kind=... at (x,y)` 형태로 남긴다.
2. **접선/법선**: `S` 주변 원본 경계점 ±6개의 평균 방향을 접선으로 삼고, 이를 90도 회전해 법선을
   구한다.
3. **맞은편 탐색(ray-cast)**: `S`에서 법선 방향(내부로 향하는 쪽 — 1px 전진해 통행 가능한 쪽을
   선택)으로 1px씩 전진하며 마스크가 통행 불가(0)로 바뀌는 지점 직전까지 이동한다. 최대
   `MAX_RAY_STEPS(= max(w, h))` 스텝 안에 못 찾으면 **맞은편 없음으로 처리하고 스킵**
   (`console.warn`으로 `[pathNodes] facing point not found: kind=... at (x,y)` 남김) — 이 경우
   입구 노드 자체는 계속 생성하되 맞은편 노드/횡단 엣지는 만들지 않는다. 찾으면 그 위치에서 같은
   컴포넌트의 원본 경계에 다시 스냅해 정확한 맞은편 좌표 `F`를 얻는다.
4. **루프 삽입**: `S`와 `F`(찾았다면)를 단순화된 코너 루프에 삽입한다 — 각 점에서 가장 가까운
   루프 선분을 찾아(수선의 발 거리 최소) 그 선분을 분할하는 자리에 끼워 넣는다. 같은 선분에 여러
   점이 삽입되면 선분을 따라가는 순서(투영 파라미터 t)로 정렬한다. 이렇게 하면 `wall` 엣지 생성
   루프가 입구/맞은편 노드도 자연히 인접 노드와 연결한다 — **"벽을 따라 이동"** 요구사항을
   그대로 만족.
5. **병합**: 삽입 위치가 기존 노드(코너 또는 이미 삽입된 다른 입구/맞은편)와 `MERGE_RADIUS_PX(6)`
   이내로 가까우면 새 노드를 만들지 않고 기존 노드를 재사용한다. 이때 타입 우선순위는
   `connector`/`landmark` > `facing` > `corner` — 더 구체적인 타입으로 갱신한다.
6. **횡단 엣지**: `S`와 `F`를 모두 성공적으로 얻었고 `distance(S, F) <= CROSSING_MAX_PX`이면,
   **오직 이 둘 사이에만** `type: 'cross'` 엣지를 하나 추가한다. `cross` 엣지는 입구↔맞은편 쌍
   전용이며, 일반 `corner` 노드끼리 가깝다고 생기지 않는다(대상은 이 3단계에서 만든 `S`/`F` 쌍
   뿐).

`CROSSING_MAX_PX`는 `MIN_COMPONENT_PIXELS`, `SIMPLIFY_EPSILON_PX`와 같은 방식으로 파일 상단에
**상수 하나로** 선언한다(기본값 100px — 축척이 없으므로 필요시 이 상수만 조정). UI 슬라이더는
추가하지 않는다.

### 3. 타입 정의

```ts
export type NodeKind = 'corner' | 'connector' | 'landmark' | 'facing'
export type EdgeKind = 'wall' | 'cross'

export interface PathNode {
  id: string
  x: number
  y: number
  type: NodeKind
  concave: boolean // corner 타입에서만 의미 있음, 나머지는 항상 false
}

export interface PathEdge {
  a: string
  b: string
  type: EdgeKind
}

export interface EntrancePoint {
  x: number
  y: number
  kind: 'connector' | 'landmark'
}
```

`generatePathNodes(mask, w, h, entrances: EntrancePoint[] = [])` — 네 번째 인자를 기본값 빈
배열로 추가해 기존 호출부(있다면)와의 하위 호환을 유지한다.

### 4. 시각화 (`MapReviewPage.tsx` — `drawPathNodes`)

| 타입 | 표시 |
| --- | --- |
| `corner` (convex) | 보라 `#7c3aed` 채운 원 (기존) |
| `corner` (concave) | 분홍 `#db2777` 채운 원 (기존) |
| `connector` | 파랑 `#2563eb` 채운 원 |
| `landmark` | 주황 `#f2992e` 채운 원 |
| `facing` | 자신과 짝지어진 입구와 같은 계열 색의 **빈 원**(테두리만, `stroke`, `fill: none`) — 어떤 타입의 맞은편인지 구분해야 하므로 `facing` 노드는 내부적으로 어느 색을 쓸지 알아야 함. 아래 "구현 메모" 참고 |
| `wall` 엣지 | 보라 실선 1.4px (기존) |
| `cross` 엣지 | 초록 `#16a34a` 점선(`setLineDash([4,3])`) |

**구현 메모**: `facing` 노드가 렌더링 시 어떤 색(연결자/랜드마크 계열)을 쓸지 알아야 하므로,
`facing` 노드에는 `pairKind: 'connector' | 'landmark'` 필드를 추가로 둔다(4단계 삽입 시 원본
입구의 `kind`를 그대로 복사). 렌더러는 `pairKind`로 빈 원의 색을 결정한다.

캔버스 아래 기존 안내 문구 옆에 범례 텍스트를 한 줄 추가한다(색상 점 + 라벨 나열, 기존
`BeaconListPage`의 범례 UI 패턴을 참고).

### 5. 예외 처리 요약

| 상황 | 처리 |
| --- | --- |
| 입구 후보가 경계에서 30px 넘게 떨어짐 | 해당 후보 스킵 + `console.warn` |
| 맞은편 탐색이 최대 스텝 내 실패 | 입구 노드는 생성, 맞은편/횡단 엣지는 스킵 + `console.warn` |
| 비콘/랜드마크가 아직 없음 | `entrances = []` → 기존 동작과 동일 |
| 두 삽입 지점이 서로 매우 가까움 | 노드 병합(중복 생성 방지) |

화면에는 에러를 노출하지 않는다 — 부분 결과가 조용히 그려질 뿐이며, 개발 중 확인용
`console.warn`만 남긴다.

## 테스트 계획

자동 테스트 프레임워크 없음(기존과 동일) — 스크래치 검증 스크립트 + 브라우저 수동 검증.

1. **스크래치 스크립트** (직전 설계 문서의 `verify_pathnodes.mjs` 확장):
   - 직선 복도 마스크(예: 4px 폭 × 20px 길이) 양쪽 벽에 입구 후보를 하나씩 두고, 각각의 맞은편이
     반대쪽 벽에서 정확히 찾아지는지, 거리가 복도 폭과 거의 같은지 확인
   - `CROSSING_MAX_PX`보다 좁은 복도 → `cross` 엣지 1개 생성 확인
   - `CROSSING_MAX_PX`보다 넓은 홀(빈 사각형) → `cross` 엣지가 생기지 않는지 확인
   - 경계에서 30px 넘게 떨어진 입구 후보 → 노드가 생성되지 않는지 확인
   - 일반 `corner` 노드 두 개가 우연히 가까워도 `cross` 엣지가 생기지 않는지 확인
2. **브라우저 수동 검증**:
   - 비콘 관리 화면에서 `type=connector` 비콘 1개, 랜드마크 관리 화면에서 랜드마크 1개를 각각
     복도에 인접하게 배치
   - 지도 검수 화면에서 복도 형태로 채운 뒤 "경로 노드 설치" 클릭
   - 파랑/주황 채운 원(입구)과 빈 원(맞은편)이 복도 양쪽에 대칭적으로 나타나는지, 좁은 구간에서
     초록 점선(횡단 엣지)이 나타나는지 확인
   - 비콘/랜드마크를 등록하지 않은 층에서는 기존과 동일하게 코너 노드만 나오는지(회귀 없음) 확인
