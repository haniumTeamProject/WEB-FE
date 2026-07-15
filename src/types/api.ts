// API 공통 타입

export interface ApiError {
  code: string
  message: string
}

export interface Paginated<T> {
  items: T[]
  total: number
}
