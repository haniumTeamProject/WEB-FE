import { http, HttpResponse } from 'msw'
import { db, nextId } from './db'
import { majorForFloor } from '@/lib/utils'
import type { Beacon, BeaconType, Building, Connector, Floor, Landmark, LandmarkType } from '@/types/domain'

function floorMajor(floorId: string): number {
  for (const list of Object.values(db.floors)) {
    const f = list.find((x) => x.id === floorId)
    if (f) return f.major
  }
  return 0
}
function bumpFloorStatus(floorId: string, from: Floor['status'], to: Floor['status']) {
  for (const list of Object.values(db.floors)) {
    const f = list.find((x) => x.id === floorId)
    if (f && f.status === from) f.status = to
  }
}

const base = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const handlers = [
  // ---- 인증 ----
  http.post(`${base}/admin/auth/login`, () => HttpResponse.json({ accessToken: 'mock-token' })),
  http.post(`${base}/admin/auth/signup`, () => new HttpResponse(null, { status: 201 })),

  // ---- 건물 ----
  http.get(`${base}/buildings`, () => HttpResponse.json(db.buildings)),

  http.post(`${base}/buildings`, async ({ request }) => {
    const body = (await request.json()) as Partial<Building>
    const building: Building = {
      id: nextId('b'),
      code: body.code ?? '',
      name: body.name ?? '',
      address: body.address,
      floorCount: body.floorCount ?? 0,
      status: 'floorplan_missing',
    }
    db.buildings.push(building)
    db.floors[building.id] = []
    return HttpResponse.json(building, { status: 201 })
  }),

  http.get(`${base}/buildings/:id`, ({ params }) => {
    const b = db.buildings.find((x) => x.id === params.id)
    return b ? HttpResponse.json(b) : new HttpResponse(null, { status: 404 })
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
    HttpResponse.json(db.floors[params.id as string] ?? []),
  ),

  http.post(`${base}/buildings/:id/floors`, async ({ params, request }) => {
    const buildingId = params.id as string
    const body = (await request.json()) as { floor: number }
    const floor: Floor = {
      id: nextId('f'),
      buildingId,
      floor: body.floor,
      major: majorForFloor(body.floor),
      status: 'floorplan_missing',
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
    // 층 상태: 설계도 미업로드 → 검수 필요
    for (const list of Object.values(db.floors)) {
      const f = list.find((x) => x.id === floorId)
      if (f && f.status === 'floorplan_missing') f.status = 'review_needed'
    }
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
    bumpFloorStatus(floorId, 'review_needed', 'beacon_missing')
    return HttpResponse.json({ ok: true })
  }),

  // ---- 비콘·체크포인트 ----
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
      connectorId?: string
      x?: number
      y?: number
    }
    const beacon: Beacon = {
      id: nextId('bc'),
      floorId,
      name: body.name,
      mac: body.mac,
      major: floorMajor(floorId),
      minor: body.minor,
      type: body.type,
      connectorId: body.connectorId,
      isAnchor: body.type === 'anchor',
      x: body.x,
      y: body.y,
    }
    db.beacons[floorId] = [...(db.beacons[floorId] ?? []), beacon]
    bumpFloorStatus(floorId, 'beacon_missing', 'ready')
    return HttpResponse.json(beacon, { status: 201 })
  }),

  http.patch(`${base}/floors/:floorId/beacons/:beaconId`, async ({ params, request }) => {
    const list = db.beacons[params.floorId as string] ?? []
    const b = list.find((x) => x.id === params.beaconId)
    if (!b) return new HttpResponse(null, { status: 404 })
    Object.assign(b, (await request.json()) as Partial<Beacon>)
    b.isAnchor = b.type === 'anchor'
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
      type: LandmarkType
      x?: number
      y?: number
    }
    const lm: Landmark = {
      id: nextId('lm'),
      floorId,
      name: body.name,
      type: body.type,
      x: body.x,
      y: body.y,
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
