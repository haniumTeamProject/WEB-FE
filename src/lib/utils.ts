/** major 값 = 100 + 층 (예: 4층 → 104) */
export function majorForFloor(floor: number): number {
  return 100 + floor
}

/** 조건부 className 병합 (간단 버전) */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
