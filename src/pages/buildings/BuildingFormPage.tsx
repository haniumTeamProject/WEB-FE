import { wrapKo } from '@/lib/wrapKo'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useCreateBuilding } from '@/features/buildings/hooks'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'

const schema = z.object({
  name: z.string().min(1, '건물명을 입력하세요'),
  code: z.string().min(1, '건물 코드를 입력하세요'),
  address: z.string().optional(),
  floorCount: z
    .string()
    .optional()
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) >= 1), '1 이상의 숫자를 입력하세요'),
})
type FormValues = z.infer<typeof schema>

export default function BuildingFormPage() {
  const navigate = useNavigate()
  const create = useCreateBuilding()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = (values: FormValues) => {
    create.mutate(
      {
        name: values.name,
        code: values.code,
        address: values.address || undefined,
        floorCount: values.floorCount ? Number(values.floorCount) : undefined,
      },
      { onSuccess: (b) => navigate(`/buildings/${b.id}`) },
    )
  }

  return (
    <div>
      <Breadcrumb items={[{ label: '홈', to: '/' }, { label: '건물 관리', to: '/buildings' }, { label: '건물 등록' }]} />
      <h1>건물 등록</h1>
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Input label="건물명" placeholder="예: ICT융합대학" error={errors.name?.message} {...register('name')} />
            <Input label="건물 코드" placeholder="suwon_ict" error={errors.code?.message} {...register('code')} />
            <Input label="주소" placeholder="경기도 화성시 …" error={errors.address?.message} {...register('address')} />
            <Input
              label="총 층수"
              type="number"
              placeholder="예: 5"
              error={errors.floorCount?.message}
              {...register('floorCount')}
            />
          </div>
          {create.isError && (
            <p style={{ color: '#DC4C4C', fontSize: 13 }}>
              {wrapKo('건물 등록에 실패했습니다. 건물 코드가 중복되지 않았는지 확인해 주세요.')}
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? '저장 중…' : '저장'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              취소
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
