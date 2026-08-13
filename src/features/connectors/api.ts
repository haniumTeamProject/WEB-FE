import { apiClient } from '@/lib/apiClient'
import type { Connector, ConnectorType } from '@/types/domain'

export interface CreateConnectorInput {
  name: string
  type: ConnectorType
  floors: number[]
}

export async function fetchConnectors(buildingId: string): Promise<Connector[]> {
  const { data } = await apiClient.get<Connector[]>(`/buildings/${buildingId}/connectors`)
  return data
}

export async function createConnector(
  buildingId: string,
  input: CreateConnectorInput,
): Promise<Connector> {
  const { data } = await apiClient.post<Connector>(`/buildings/${buildingId}/connectors`, input)
  return data
}

export async function deleteConnector(buildingId: string, connectorId: string): Promise<void> {
  await apiClient.delete(`/buildings/${buildingId}/connectors/${connectorId}`)
}

export async function setConnectorPosition(
  buildingId: string,
  connectorId: string,
  floorId: string,
  x: number,
  y: number,
): Promise<Connector> {
  const { data } = await apiClient.put<Connector>(
    `/buildings/${buildingId}/connectors/${connectorId}/positions/${floorId}`,
    { x, y },
  )
  return data
}

export async function clearConnectorPosition(
  buildingId: string,
  connectorId: string,
  floorId: string,
): Promise<Connector> {
  const { data } = await apiClient.delete<Connector>(
    `/buildings/${buildingId}/connectors/${connectorId}/positions/${floorId}`,
  )
  return data
}
