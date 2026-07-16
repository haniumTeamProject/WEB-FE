import { apiClient } from '@/lib/apiClient'
import type { Beacon, BeaconType } from '@/types/domain'

export interface CreateBeaconInput {
  name: string
  mac?: string
  minor: number
  type: BeaconType
  connectorId?: string
  x?: number
  y?: number
}

export type UpdateBeaconInput = Partial<{
  name: string
  mac: string
  minor: number
  type: BeaconType
  connectorId?: string
  x: number
  y: number
}>

export async function fetchBeacons(floorId: string): Promise<Beacon[]> {
  const { data } = await apiClient.get<Beacon[]>(`/floors/${floorId}/beacons`)
  return data
}

export async function createBeacon(floorId: string, input: CreateBeaconInput): Promise<Beacon> {
  const { data } = await apiClient.post<Beacon>(`/floors/${floorId}/beacons`, input)
  return data
}

export async function updateBeacon(
  floorId: string,
  beaconId: string,
  input: UpdateBeaconInput,
): Promise<Beacon> {
  const { data } = await apiClient.patch<Beacon>(`/floors/${floorId}/beacons/${beaconId}`, input)
  return data
}

export async function deleteBeacon(floorId: string, beaconId: string): Promise<void> {
  await apiClient.delete(`/floors/${floorId}/beacons/${beaconId}`)
}
