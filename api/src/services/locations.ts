import type { QueryResolvers } from 'types/graphql'
import { cachedOpenRouteClient } from 'src/lib/cachedOpenroute'
import { handleResolverError } from 'src/lib/errors'

export const geocodeAddress: QueryResolvers['geocodeAddress'] = async ({ address }) => {
  try {
    const coordinate = await cachedOpenRouteClient.geocodeAddress(address)
    return coordinate
  } catch (error) {
    handleResolverError(error, 'geocodeAddress')
  }
}