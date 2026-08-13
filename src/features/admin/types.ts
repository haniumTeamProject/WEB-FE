export interface UpdateAdminStatusInput {
  status: 'active' | 'rejected'
}

export interface UpdateAdminProfileInput {
  name: string
  email: string
  org: string
}
