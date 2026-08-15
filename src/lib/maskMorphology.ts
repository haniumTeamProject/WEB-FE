// 마스크(Uint8Array, 1=통행가능) 위 모폴로지 연산. 가로/세로로 분리한 박스 필터라 O(w*h)에 가깝게 돈다.
// 틈 메우기(닫힘=팽창→침식)와 노이즈 제거(열림=침식→팽창)에 공용으로 쓴다.

export function dilateMask(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let found = 0
      const xlo = Math.max(0, x - r)
      const xhi = Math.min(w - 1, x + r)
      for (let nx = xlo; nx <= xhi; nx++) {
        if (mask[row + nx]) {
          found = 1
          break
        }
      }
      tmp[row + x] = found
    }
  }
  const out = new Uint8Array(w * h)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let found = 0
      const ylo = Math.max(0, y - r)
      const yhi = Math.min(h - 1, y + r)
      for (let ny = ylo; ny <= yhi; ny++) {
        if (tmp[ny * w + x]) {
          found = 1
          break
        }
      }
      out[y * w + x] = found
    }
  }
  return out
}

export function erodeMask(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let all = 1
      const xlo = Math.max(0, x - r)
      const xhi = Math.min(w - 1, x + r)
      for (let nx = xlo; nx <= xhi; nx++) {
        if (!mask[row + nx]) {
          all = 0
          break
        }
      }
      tmp[row + x] = all
    }
  }
  const out = new Uint8Array(w * h)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let all = 1
      const ylo = Math.max(0, y - r)
      const yhi = Math.min(h - 1, y + r)
      for (let ny = ylo; ny <= yhi; ny++) {
        if (!tmp[ny * w + x]) {
          all = 0
          break
        }
      }
      out[y * w + x] = all
    }
  }
  return out
}

// 틈 메우기: 팽창(반경 r, 벽에는 안 번짐) → 침식(반경 r, 벽 근처 통행영역은 안 깎이게 벽을 임시로 안전 취급) → 다시 벽 제외
export function closeGaps(walkable: Uint8Array, barrier: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const grown = dilateMask(walkable, w, h, r)
  const growAllowed = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) growAllowed[i] = grown[i] && !barrier[i] ? 1 : 0
  const forErosion = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) forErosion[i] = growAllowed[i] || barrier[i] ? 1 : 0
  const eroded = erodeMask(forErosion, w, h, r)
  const result = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) result[i] = eroded[i] && !barrier[i] ? 1 : 0
  return result
}

// 노이즈 제거: 침식(반경 r) → 팽창(반경 r) — r보다 작은 돌출부·구멍이 사라진 뒤 원래 모양으로 복원
export function openNoise(walkable: Uint8Array, barrier: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const shrunk = erodeMask(walkable, w, h, r)
  const restored = dilateMask(shrunk, w, h, r)
  const result = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) result[i] = restored[i] && !barrier[i] ? 1 : 0
  return result
}
