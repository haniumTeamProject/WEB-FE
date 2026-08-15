import type { FloorMask } from '@/features/mapEditor/api'

export interface RasterizedMask {
  w: number
  h: number
  walkable: Uint8Array
}

// 마스크 PNG를 래스터화해 통행가능 픽셀(alpha>0)의 Uint8 버퍼로 변환
export async function rasterizeMask(mask: FloorMask): Promise<RasterizedMask> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('마스크 이미지를 불러올 수 없습니다.'))
    img.src = mask.dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = mask.width
  canvas.height = mask.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, mask.width, mask.height)
  const data = ctx.getImageData(0, 0, mask.width, mask.height).data
  const walkable = new Uint8Array(mask.width * mask.height)
  for (let i = 0; i < walkable.length; i++) walkable[i] = data[i * 4 + 3] > 0 ? 1 : 0
  return { w: mask.width, h: mask.height, walkable }
}
