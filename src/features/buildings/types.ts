export interface CreateBuildingInput {
  name: string
  code: string
  address?: string
  floorCount?: number
}

export type UpdateBuildingInput = Partial<CreateBuildingInput>
