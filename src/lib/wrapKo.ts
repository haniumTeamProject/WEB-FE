// 한글 줄바꿈 다듬기.
//
// 기본 CSS(word-break: keep-all)는 "띄어쓰기(어절)"마다 줄바꿈해서, 긴 문장이
// 어중간한 지점에서 끊기곤 한다. 이 함수는 **쉼표·마침표에서만** 줄바꿈되게 만든다:
// 구절(구두점 사이) 내부의 띄어쓰기는 NBSP로 묶어 안 끊기게 하고, 구두점 뒤에만
// 일반 공백(줄바꿈 가능)을 남긴다. 구절 하나가 너무 길어 한 줄에 안 들어가면
// 전역 CSS의 overflow-wrap: break-word 가 음절 단위로 끊는다(마지막 fallback).
//
//   "A를 하고, B를 합니다."  →  'A를 하고,' / 'B를 합니다.' 처럼 구두점에서만 줄바꿈
//
// 규칙: 쉼표·마침표 우선 → 안 되면(구두점 없거나 구절이 너무 김) 음절.
const NBSP = String.fromCharCode(0x00a0) // 눈에 안 보이는 리터럴 대신 코드포인트로 명시
const CLAUSE_BOUNDARY = /(?<=[,.!?。！？])\s+/

export function wrapKo(text: string): string {
  return text
    .split(CLAUSE_BOUNDARY)
    .map((clause) => clause.replace(/ /g, NBSP)) // 구절 내부 공백 → NBSP(안 끊김)
    .join(' ') // 구절 사이에만 일반 공백 = 줄바꿈 지점
}
