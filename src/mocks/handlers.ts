import { http, HttpResponse } from 'msw'
import { buildings, floors } from './db'

const base = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const handlers = [
  // 인증
  http.post(`${base}/admin/auth/login`, () => HttpResponse.json({ accessToken: 'mock-token' })),
  http.post(`${base}/admin/auth/signup`, () => new HttpResponse(null, { status: 201 })),

  // 건물
  http.get(`${base}/buildings`, () => HttpResponse.json(buildings)),
  http.get(`${base}/buildings/:id`, ({ params }) => {
    const b = buildings.find((x) => x.id === params.id)
    return b ? HttpResponse.json(b) : new HttpResponse(null, { status: 404 })
  }),
  http.get(`${base}/buildings/:id/floors`, ({ params }) =>
    HttpResponse.json(floors[params.id as string] ?? []),
  ),
]
