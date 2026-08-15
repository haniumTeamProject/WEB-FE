import { Button } from './Button'
import { Modal } from './Modal'
import { SentenceText } from './SentenceText'

// 삭제 등 되돌릴 수 없는 작업 전에 공통으로 쓰는 확인 모달.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '삭제',
  cancelLabel = '취소',
  confirmVariant = 'danger',
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'danger' | 'primary'
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {description && <SentenceText text={description} className="text-muted" />}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
        <Button variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={confirmVariant} disabled={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
