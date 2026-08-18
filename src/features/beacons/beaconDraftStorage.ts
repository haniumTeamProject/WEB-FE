// 작성 중이던 비콘 등록 폼을 층 ID 기준 sessionStorage에 임시 보관한다.
//
// 축척은 다른 화면(지도 검수)에서 설정하는데, 거기 다녀오는 사이 폼이 언마운트되며
// 입력값·찍어둔 위치가 날아간다. 그 사이에도 값을 잃지 않고 "이어서 등록"할 수 있게
// 초안을 보관했다가 화면으로 돌아오면 복원한다. (경로노드의 pathNodesStorage와 같은 방식)
//
// sessionStorage인 이유: 초안은 이번 작업 세션에서만 의미가 있다. 탭을 닫으면 사라지는 게
// 맞고, 며칠 뒤까지 남은 낡은 초안이 되살아나면 오히려 혼란스럽다.

export interface BeaconDraft {
  name: string
  mac: string
  minor: string
  pendingPos: { x: number; y: number } | null
}

const key = (floorId: string) => `beaconDraft:${floorId}`

function isEmpty(d: BeaconDraft): boolean {
  return !d.name && !d.mac && !d.minor && !d.pendingPos
}

export function loadBeaconDraft(floorId: string): BeaconDraft | null {
  try {
    const raw = sessionStorage.getItem(key(floorId))
    return raw ? (JSON.parse(raw) as BeaconDraft) : null
  } catch {
    return null
  }
}

export function saveBeaconDraft(floorId: string, draft: BeaconDraft): void {
  try {
    // 빈 초안은 저장하지 않고 오히려 지운다 — 등록 성공 후 폼이 비면 초안도 함께 사라진다.
    if (isEmpty(draft)) sessionStorage.removeItem(key(floorId))
    else sessionStorage.setItem(key(floorId), JSON.stringify(draft))
  } catch {
    /* 저장 실패(용량 초과 등)는 무시 — 초안 보관은 편의 기능이다 */
  }
}
