import { http, HttpResponse } from 'msw'
import { db, nextId } from './db'
import { majorForFloor } from '@/lib/utils'
import type { Admin, Beacon, BeaconType, Building, Connector, Floor, FloorSetupStatus, Landmark } from '@/types/domain'

function floorMajor(floorId: string): number {
  for (const list of Object.values(db.floors)) {
    const f = list.find((x) => x.id === floorId)
    if (f) return f.major
  }
  return 0
}

function findBuildingIdForFloor(floorId: string): string | undefined {
  return Object.keys(db.floors).find((buildingId) => db.floors[buildingId].some((f) => f.id === floorId))
}

// 정책 2.3: 층 세팅 상태는 저장해두고 수동으로 갱신하는 대신, 매 조회마다 실제 데이터로부터 계산한다 —
// 그래야 비콘 삭제처럼 "되돌아가는" 변경도 상태에 항상 정확히 반영된다.
function computeFloorStatus(floorId: string): FloorSetupStatus {
  if (!db.floorplans[floorId]) return 'floorplan_missing'
  if (!db.masks[floorId]) return 'review_needed'
  if (!db.scales[floorId]) return 'scale_missing'
  const beacons = db.beacons[floorId] ?? []
  if (beacons.length === 0) return 'beacon_missing'

  const buildingId = findBuildingIdForFloor(floorId)
  const floor = buildingId ? db.floors[buildingId].find((f) => f.id === floorId) : undefined
  if (buildingId && floor) {
    const connectorsForFloor = (db.connectors[buildingId] ?? []).filter((c) => c.floors.includes(floor.floor))
    const missing = connectorsForFloor.some((c) => !c.positions?.some((p) => p.floorId === floorId))
    if (missing) return 'connector_missing'
  }
  return 'ready'
}

const FLOOR_STATUS_PROGRESS: FloorSetupStatus[] = [
  'floorplan_missing',
  'review_needed',
  'scale_missing',
  'beacon_missing',
  'connector_missing',
  'ready',
]

// 건물 대표 상태 = 그 건물 층 중 가장 진행이 덜 된 상태 (층이 하나도 없으면 설계도 미업로드 취급)
function computeBuildingStatus(buildingId: string): FloorSetupStatus {
  const floors = db.floors[buildingId] ?? []
  if (floors.length === 0) return 'floorplan_missing'
  return floors
    .map((f) => computeFloorStatus(f.id))
    .reduce((worst, s) => (FLOOR_STATUS_PROGRESS.indexOf(s) < FLOOR_STATUS_PROGRESS.indexOf(worst) ? s : worst))
}

const base = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const handlers = [
  // ---- 인증 ----
  http.post(`${base}/admin/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    // 데모 목업: 비밀번호는 검증하지 않고, 입력한 이메일과 일치하는 계정이 있으면 그 정보를 돌려준다
    // (없으면 슈퍼관리자로 대체) — 실제 백엔드에서는 토큰 발급 시 본인 계정 정보를 내려주면 됨.
    const admin = db.admins.find((a) => a.email === body.email) ?? db.admins.find((a) => a.role === 'super_admin')
    return HttpResponse.json({
      accessToken: 'mock-token',
      email: admin?.email ?? body.email,
      name: admin?.name ?? '관리자',
      role: admin?.role ?? 'admin',
    })
  }),

  http.post(`${base}/admin/auth/signup`, async ({ request }) => {
    const body = (await request.json()) as {
      email: string
      password: string
      name: string
      org: string
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

  http.patch(`${base}/admin/me`, async ({ request }) => {
    const superAdmin = db.admins.find((a) => a.role === 'super_admin')
    if (!superAdmin) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { name?: string; email?: string; org?: string }
    Object.assign(superAdmin, body)
    return HttpResponse.json(superAdmin)
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

  // ---- 건물 ----
  // 정책 2.2: 즐겨찾기 우선, 즐겨찾기/일반 목록 각각 이름 사전순
  http.get(`${base}/buildings`, () => {
    const sorted = [...db.buildings].sort((a, b) => {
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1
      return a.name.localeCompare(b.name, 'ko')
    })
    return HttpResponse.json(sorted.map((b) => ({ ...b, status: computeBuildingStatus(b.id) })))
  }),

  http.post(`${base}/buildings`, async ({ request }) => {
    const body = (await request.json()) as Partial<Building>
    const building: Building = {
      id: nextId('b'),
      code: body.code ?? '',
      name: body.name ?? '',
      address: body.address,
      floorCount: body.floorCount ?? 0,
      createdAt: new Date().toISOString(),
    }
    db.buildings.push(building)
    db.floors[building.id] = []
    return HttpResponse.json(building, { status: 201 })
  }),

  http.get(`${base}/buildings/:id`, ({ params }) => {
    const b = db.buildings.find((x) => x.id === params.id)
    return b ? HttpResponse.json({ ...b, status: computeBuildingStatus(b.id) }) : new HttpResponse(null, { status: 404 })
  }),

  http.patch(`${base}/buildings/:id`, async ({ params, request }) => {
    const b = db.buildings.find((x) => x.id === params.id)
    if (!b) return new HttpResponse(null, { status: 404 })
    Object.assign(b, (await request.json()) as Partial<Building>)
    return HttpResponse.json(b)
  }),

  http.delete(`${base}/buildings/:id`, ({ params }) => {
    const i = db.buildings.findIndex((x) => x.id === params.id)
    if (i >= 0) db.buildings.splice(i, 1)
    delete db.floors[params.id as string]
    return new HttpResponse(null, { status: 204 })
  }),

  // ---- 층 ----
  http.get(`${base}/buildings/:id/floors`, ({ params }) =>
    HttpResponse.json(
      (db.floors[params.id as string] ?? []).map((f) => ({ ...f, status: computeFloorStatus(f.id) })),
    ),
  ),

  http.post(`${base}/buildings/:id/floors`, async ({ params, request }) => {
    const buildingId = params.id as string
    const body = (await request.json()) as { floor: number }
    const floor: Floor = {
      id: nextId('f'),
      buildingId,
      floor: body.floor,
      major: majorForFloor(body.floor),
    }
    db.floors[buildingId] = [...(db.floors[buildingId] ?? []), floor].sort(
      (a, b) => a.floor - b.floor,
    )
    return HttpResponse.json(floor, { status: 201 })
  }),

  http.delete(`${base}/buildings/:buildingId/floors/:floorId`, ({ params }) => {
    const list = db.floors[params.buildingId as string]
    if (list) {
      db.floors[params.buildingId as string] = list.filter((f) => f.id !== params.floorId)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // ---- 수직 연결자 ----
  http.get(`${base}/buildings/:id/connectors`, ({ params }) =>
    HttpResponse.json(db.connectors[params.id as string] ?? []),
  ),

  http.post(`${base}/buildings/:id/connectors`, async ({ params, request }) => {
    const buildingId = params.id as string
    const body = (await request.json()) as Pick<Connector, 'name' | 'type' | 'floors'>
    const connector: Connector = {
      id: nextId('c'),
      buildingId,
      name: body.name,
      type: body.type,
      floors: (body.floors ?? []).slice().sort((a, b) => a - b),
    }
    db.connectors[buildingId] = [...(db.connectors[buildingId] ?? []), connector]
    return HttpResponse.json(connector, { status: 201 })
  }),

  http.delete(`${base}/buildings/:buildingId/connectors/:connectorId`, ({ params }) => {
    const list = db.connectors[params.buildingId as string]
    if (list) {
      db.connectors[params.buildingId as string] = list.filter((c) => c.id !== params.connectorId)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.put(
    `${base}/buildings/:buildingId/connectors/:connectorId/positions/:floorId`,
    async ({ params, request }) => {
      const { buildingId, connectorId, floorId } = params as Record<string, string>
      const body = (await request.json()) as { x: number; y: number }
      const list = db.connectors[buildingId]
      const connector = list?.find((c) => c.id === connectorId)
      if (!connector) return new HttpResponse(null, { status: 404 })
      const positions = (connector.positions ?? []).filter((p) => p.floorId !== floorId)
      connector.positions = [...positions, { floorId, x: body.x, y: body.y }]
      return HttpResponse.json(connector)
    },
  ),

  http.delete(
    `${base}/buildings/:buildingId/connectors/:connectorId/positions/:floorId`,
    ({ params }) => {
      const { buildingId, connectorId, floorId } = params as Record<string, string>
      const list = db.connectors[buildingId]
      const connector = list?.find((c) => c.id === connectorId)
      if (!connector) return new HttpResponse(null, { status: 404 })
      connector.positions = (connector.positions ?? []).filter((p) => p.floorId !== floorId)
      return HttpResponse.json(connector)
    },
  ),

  // ---- 설계도(Floorplan) ----
  http.get(`${base}/floors/:floorId/floorplan`, ({ params }) =>
    HttpResponse.json(db.floorplans[params.floorId as string] ?? null),
  ),

  http.put(`${base}/floors/:floorId/floorplan`, async ({ params, request }) => {
    const floorId = params.floorId as string
    const body = (await request.json()) as { imageUrl: string }
    // 실제 서버는 여기서 벽·이동영역을 자동 추출. mock은 즉시 완료 처리.
    const fp = { floorId, imageUrl: body.imageUrl, extracted: true }
    db.floorplans[floorId] = fp
    return HttpResponse.json(fp)
  }),

  http.delete(`${base}/floors/:floorId/floorplan`, ({ params }) => {
    delete db.floorplans[params.floorId as string]
    return new HttpResponse(null, { status: 204 })
  }),

  // ---- 지도 검수: 이동영역 마스크 ----
  http.get(`${base}/floors/:floorId/mask`, ({ params }) =>
    HttpResponse.json(db.masks[params.floorId as string] ?? null),
  ),

  http.put(`${base}/floors/:floorId/mask`, async ({ params, request }) => {
    const floorId = params.floorId as string
    db.masks[floorId] = await request.json()
    return HttpResponse.json({ ok: true })
  }),

  // ---- 지도 검수: 축척 ----
  http.get(`${base}/floors/:floorId/scale`, ({ params }) =>
    HttpResponse.json(db.scales[params.floorId as string] ?? null),
  ),

  http.put(`${base}/floors/:floorId/scale`, async ({ params, request }) => {
    const floorId = params.floorId as string
    db.scales[floorId] = (await request.json()) as { scaleMPerPx: number }
    return HttpResponse.json({ ok: true })
  }),

  // ---- 비콘 ----
  http.get(`${base}/floors/:floorId/beacons`, ({ params }) =>
    HttpResponse.json(db.beacons[params.floorId as string] ?? []),
  ),

  http.post(`${base}/floors/:floorId/beacons`, async ({ params, request }) => {
    const floorId = params.floorId as string
    const body = (await request.json()) as {
      name: string
      mac?: string
      minor: number
      type: BeaconType
      x?: number
      y?: number
      sourceUid?: string
      sourceLabel?: string
    }
    const beacon: Beacon = {
      id: nextId('bc'),
      floorId,
      name: body.name,
      mac: body.mac,
      major: floorMajor(floorId),
      minor: body.minor,
      type: body.type,
      x: body.x,
      y: body.y,
      sourceUid: body.sourceUid,
      sourceLabel: body.sourceLabel,
    }
    db.beacons[floorId] = [...(db.beacons[floorId] ?? []), beacon]
    return HttpResponse.json(beacon, { status: 201 })
  }),

  http.patch(`${base}/floors/:floorId/beacons/:beaconId`, async ({ params, request }) => {
    const list = db.beacons[params.floorId as string] ?? []
    const b = list.find((x) => x.id === params.beaconId)
    if (!b) return new HttpResponse(null, { status: 404 })
    Object.assign(b, (await request.json()) as Partial<Beacon>)
    return HttpResponse.json(b)
  }),

  http.delete(`${base}/floors/:floorId/beacons/:beaconId`, ({ params }) => {
    const list = db.beacons[params.floorId as string]
    if (list) {
      db.beacons[params.floorId as string] = list.filter((x) => x.id !== params.beaconId)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // ---- 목적지(랜드마크) ----
  http.get(`${base}/floors/:floorId/landmarks`, ({ params }) =>
    HttpResponse.json(db.landmarks[params.floorId as string] ?? []),
  ),

  http.post(`${base}/floors/:floorId/landmarks`, async ({ params, request }) => {
    const floorId = params.floorId as string
    const body = (await request.json()) as {
      name: string
      category?: string
      x?: number
      y?: number
      sourceUid?: string
      sourceLabel?: string
    }
    const lm: Landmark = {
      id: nextId('lm'),
      floorId,
      name: body.name,
      category: body.category,
      x: body.x,
      y: body.y,
      sourceUid: body.sourceUid,
      sourceLabel: body.sourceLabel,
    }
    db.landmarks[floorId] = [...(db.landmarks[floorId] ?? []), lm]
    return HttpResponse.json(lm, { status: 201 })
  }),

  http.patch(`${base}/floors/:floorId/landmarks/:landmarkId`, async ({ params, request }) => {
    const list = db.landmarks[params.floorId as string] ?? []
    const lm = list.find((x) => x.id === params.landmarkId)
    if (!lm) return new HttpResponse(null, { status: 404 })
    Object.assign(lm, (await request.json()) as Partial<Landmark>)
    return HttpResponse.json(lm)
  }),

  http.delete(`${base}/floors/:floorId/landmarks/:landmarkId`, ({ params }) => {
    const list = db.landmarks[params.floorId as string]
    if (list) {
      db.landmarks[params.floorId as string] = list.filter((x) => x.id !== params.landmarkId)
    }
    return new HttpResponse(null, { status: 204 })
  }),
]
