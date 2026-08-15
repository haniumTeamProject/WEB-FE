import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import { splitSentences } from '@/lib/utils'

// 긴 안내 문구가 단어 중간에서 줄바뀜하지 않도록 문장(마침표) 단위로 줄바꿈한다.
export function SentenceText({
  text,
  className,
  style,
}: {
  text: string
  className?: string
  style?: CSSProperties
}) {
  const sentences = splitSentences(text)
  return (
    <p className={className} style={{ wordBreak: 'keep-all', ...style }}>
      {sentences.map((s, i) => (
        <Fragment key={i}>
          {s}
          {i < sentences.length - 1 && <br />}
        </Fragment>
      ))}
    </p>
  )
}
