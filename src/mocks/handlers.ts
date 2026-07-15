import { http, HttpResponse } from 'msw'
import { db, nextId } from './db'
import { majorForFloor } from '@/lib/utils'
import type { Building, Floor } from '@/types/domain'

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
]
