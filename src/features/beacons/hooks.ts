import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBeacon, deleteBeacon, fetchBeacons, updateBeacon } from './api'
import type { CreateBeaconInput, UpdateBeaconInput } from './api'

const key = (floorId: string) => ['floors', floorId, 'beacons']

export function useBeacons(floorId: string) {
  return useQuery({ queryKey: key(floorId), queryFn: () => fetchBeacons(floorId), enabled: !!floorId })
}

export function useCreateBeacon(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBeaconInput) => createBeacon(floorId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(floorId) })
      qc.invalidateQueries({ queryKey: ['buildings'] })
    },
  })
}

export function useUpdateBeacon(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { beaconId: string; input: UpdateBeaconInput }) =>
      updateBeacon(floorId, vars.beaconId, vars.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(floorId) }),
  })
}

export function useDeleteBeacon(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (beaconId: string) => deleteBeacon(floorId, beaconId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(floorId) }),
  })
}
