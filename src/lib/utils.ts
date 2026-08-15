/** major 값 = 100 + 층 (예: 4층 → 104) */
export function majorForFloor(floor: number): number {
  return 100 + floor
}

/** 조건부 className 병합 (간단 버전) */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

/** 좌표를 grid(기본 5px) 단위로 반올림 — 비콘·랜드마크·연결자 배치 시 픽셀 스냅에 사용 */
export function snapToGrid(value: number, grid = 5): number {
  return Math.round(value / grid) * grid || 0 // -0 대신 0을 반환
}

/** 마침표+공백 기준으로 문장을 나눈다 — 안내 문구를 단어 중간이 아니라 문장 단위로 줄바꿈할 때 씀 */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=\.)\s+/)
}
