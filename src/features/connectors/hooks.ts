import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createConnector, deleteConnector, fetchConnectors } from './api'
import type { CreateConnectorInput } from './api'

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

export function useDeleteConnector(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (connectorId: string) => deleteConnector(buildingId, connectorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings', buildingId, 'connectors'] }),
  })
}
