import { useEffect, useState } from 'react'
import type { CastMap } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'

export function useCast() {
  const { activeProfileId } = useProfiles()
  const [cast, setCast] = useState<CastMap>({})

  useEffect(() => {
    if (!activeProfileId) return
    api.getCast().then(setCast)
  }, [activeProfileId])

  return cast
}
