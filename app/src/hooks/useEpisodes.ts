import { useCallback, useEffect, useState } from 'react'
import type { EpisodesMap } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'

export function useEpisodes() {
  const { activeProfileId } = useProfiles()
  const [episodes, setEpisodes] = useState<EpisodesMap>({})

  const reload = useCallback(() => {
    if (!activeProfileId) return Promise.resolve()
    return api.getEpisodes().then(setEpisodes)
  }, [activeProfileId])

  useEffect(() => {
    reload()
  }, [reload])

  return { episodes, reload }
}
