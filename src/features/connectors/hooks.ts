import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createConnector,
  deleteConnector,
  fetchConnectors,
  setConnectorPosition,
  clearConnectorPosition,
  updateConnector,
} from './api'
import type { CreateConnectorInput, UpdateConnectorInput } from './api'

export function useConnectors(buildingId: string) {
  return useQuery({
    queryKey: ['buildings', buildingId, 'connectors'],
    queryFn: () => fetchConnectors(buildingId),
    enabled: !!buildingId,
  })
}

export function useCreateConnector(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateConnectorInput) => createConnector(buildingId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings', buildingId, 'connectors'] }),
  })
}

export function useUpdateConnector(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ connectorId, input }: { connectorId: string; input: UpdateConnectorInput }) =>
      updateConnector(buildingId, connectorId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings', buildingId, 'connectors'] }),
  })
}

export function useDeleteConnector(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (connectorId: string) => deleteConnector(buildingId, connectorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings', buildingId, 'connectors'] }),
  })
}

export function useSetConnectorPosition(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ connectorId, floorId, x, y }: { connectorId: string; floorId: string; x: number; y: number }) =>
      setConnectorPosition(buildingId, connectorId, floorId, x, y),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings', buildingId, 'connectors'] }),
  })
}

export function useClearConnectorPosition(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ connectorId, floorId }: { connectorId: string; floorId: string }) =>
      clearConnectorPosition(buildingId, connectorId, floorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings', buildingId, 'connectors'] }),
  })
}
