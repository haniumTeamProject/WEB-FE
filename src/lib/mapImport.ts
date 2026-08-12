// map-tool(iframe)이 내보낸 mappinProject JSON을 읽어 비콘/랜드마크만 뽑아내고,
// 관리자웹에 이미 등록된 항목과 sourceUid로 비교(diff)하는 유틸.
// uid가 삭제되지 않고 유지되는 한 관리자가 입력한 MAC·이름은 재가져오기에도 보존된다.

import { MAP_DESIGN_W } from './constants'

export interface MappinProjectBeacon {
  id: string // map-tool 표시 라벨, 예: B3
  uid: string
  x: number
  y: number
}

export interface MappinProjectLandmark {
  id: string // map-tool 표시 라벨, 예: L01
  uid: string
  x: number
  y: number
  name: string
  isConnector?: boolean
}

export interface MappinProjectFile {
  beacons: MappinProjectBeacon[]
  landmarks: MappinProjectLandmark[]
  origW: number // map-tool 작업 좌표 기준 폭 — 관리자웹의 900 기준 좌표로 환산할 때 필요
}

export async function parseMappinProjectFile(file: File): Promise<MappinProjectFile> {
  let json: unknown
  try {
    json = JSON.parse(await file.text())
  } catch {
    throw new Error('JSON 파일을 읽을 수 없습니다.')
  }
  const obj = json as Record<string, unknown>
  if (obj?.mappinProject !== true || !Array.isArray(obj.beacons) || !Array.isArray(obj.landmarks)) {
    throw new Error('지도 편집 도구에서 내보낸 파일이 아닙니다.')
  }
  if (typeof obj.origW !== 'number' || obj.origW <= 0) {
    throw new Error('파일에 좌표 기준 폭(origW)이 없어 좌표를 변환할 수 없습니다.')
  }
  return {
    beacons: obj.beacons as MappinProjectBeacon[],
    landmarks: obj.landmarks as MappinProjectLandmark[],
    origW: obj.origW,
  }
}

// map-tool 작업 좌표(원본 이미지 픽셀 기준) → 관리자웹 설계도 좌표(900 기준)로 환산.
// 두 좌표계 모두 원본 이미지를 등비 축소한 것이므로 폭 비율 하나로 x/y를 동일하게 변환한다.
export function toDesignCoords(x: number, y: number, origW: number): { x: number; y: number } {
  const scale = MAP_DESIGN_W / origW
  return { x: x * scale, y: y * scale }
}

export interface ImportSource {
  uid: string
  label: string
  x: number
  y: number
}

interface HasSourceUid {
  id: string
  sourceUid?: string
}

export interface ImportPlan<T extends HasSourceUid> {
  toCreate: ImportSource[]
  toUpdate: { target: T; source: ImportSource }[]
  toDelete: T[]
}

// sourceUid가 없는(수동 생성) 기존 항목은 비교 대상에서 제외 — import가 절대 건드리지 않는다.
export function diffImport<T extends HasSourceUid>(existing: T[], sources: ImportSource[]): ImportPlan<T> {
  const byUid = new Map(existing.filter((e) => e.sourceUid).map((e) => [e.sourceUid as string, e]))
  const seenUids = new Set<string>()
  const toCreate: ImportSource[] = []
  const toUpdate: { target: T; source: ImportSource }[] = []

  for (const source of sources) {
    seenUids.add(source.uid)
    const target = byUid.get(source.uid)
    if (target) toUpdate.push({ target, source })
    else toCreate.push(source)
  }

  const toDelete = existing.filter((e) => e.sourceUid && !seenUids.has(e.sourceUid))
  return { toCreate, toUpdate, toDelete }
}
