/**
 * Debug test for optimization goal errors with exact user addresses
 * Tests the specific 11 Michigan addresses that are causing state corruption
 */

import { findOptimalLocationsResolver } from './isochrones'

describe('Optimization Goal Debug Test', () => {
  const michiganAddresses = [
    {
      latitude: 42.4584,
      longitude: -83.1496,
      name: '23251 manistee st oak park',
    },
    {
      latitude: 42.4973,
      longitude: -82.8951,
      name: '21740 Edmunton St, St Clair Shores',
    },
    {
      latitude: 42.3831,
      longitude: -82.9115,
      name: '1077 Maryland St, Grosse Pointe Park',
    },
    {
      latitude: 42.4608,
      longitude: -83.1496,
      name: '564 Stratford Rd, Ferndale',
    },
    {
      latitude: 42.4973,
      longitude: -83.3774,
      name: '32080 Olde Franklin Dr, Farmington Hills',
    },
    {
      latitude: 42.5533,
      longitude: -83.3774,
      name: '5383 Langlewood Dr, West Bloomfield',
    },
    {
      latitude: 42.6803,
      longitude: -83.1496,
      name: '362 Shagbark Dr, Rochester Hills',
    },
    { latitude: 42.6058, longitude: -83.1496, name: '1358 Trevino Dr, Troy' },
    {
      latitude: 42.6058,
      longitude: -82.9951,
      name: '41226 Marjoran Dr, Sterling Heights',
    },
    {
      latitude: 42.6803,
      longitude: -82.8951,
      name: '29111 Timber Woods Dr, Chesterfield',
    },
    {
      latitude: 42.5833,
      longitude: -82.9167,
      name: '44565 Bayview Ave, Clinton Township',
    },
  ]

  // Test each optimization goal individually to isolate the issue
  it('should handle MINIMAX optimization goal', async () => {
    const result = await findOptimalLocationsResolver({
      locations: michiganAddresses,
      travelMode: 'DRIVING_CAR',
      optimizationGoal: 'MINIMAX',
      topM: 5,
      gridSize: 5,
      deduplicationThreshold: 100,
    })

    expect(result).toBeDefined()
    expect(result.optimalPoints).toBeDefined()
    expect(result.optimalPoints.length).toBeGreaterThan(0)
  }, 30000)

  it('should handle MINIMIZE_VARIANCE optimization goal', async () => {
    const result = await findOptimalLocationsResolver({
      locations: michiganAddresses,
      travelMode: 'DRIVING_CAR',
      optimizationGoal: 'MINIMIZE_VARIANCE',
      topM: 5,
      gridSize: 5,
      deduplicationThreshold: 100,
    })

    expect(result).toBeDefined()
    expect(result.optimalPoints).toBeDefined()
    expect(result.optimalPoints.length).toBeGreaterThan(0)
  }, 30000)

  it('should handle MINIMIZE_TOTAL optimization goal', async () => {
    const result = await findOptimalLocationsResolver({
      locations: michiganAddresses,
      travelMode: 'DRIVING_CAR',
      optimizationGoal: 'MINIMIZE_TOTAL',
      topM: 5,
      gridSize: 5,
      deduplicationThreshold: 100,
    })

    expect(result).toBeDefined()
    expect(result.optimalPoints).toBeDefined()
    expect(result.optimalPoints.length).toBeGreaterThan(0)
  }, 30000)

  // Test sequential calls to verify no state corruption
  it('should handle sequential calls without state corruption', async () => {
    // First call with MINIMIZE_VARIANCE (which was failing)
    const result1 = await findOptimalLocationsResolver({
      locations: michiganAddresses,
      travelMode: 'DRIVING_CAR',
      optimizationGoal: 'MINIMIZE_VARIANCE',
      topM: 5,
      gridSize: 5,
      deduplicationThreshold: 100,
    })

    expect(result1).toBeDefined()
    expect(result1.optimalPoints.length).toBeGreaterThan(0)

    // Second call with MINIMAX (which should work even after MINIMIZE_VARIANCE fails)
    const result2 = await findOptimalLocationsResolver({
      locations: michiganAddresses,
      travelMode: 'DRIVING_CAR',
      optimizationGoal: 'MINIMAX',
      topM: 5,
      gridSize: 5,
      deduplicationThreshold: 100,
    })

    expect(result2).toBeDefined()
    expect(result2.optimalPoints.length).toBeGreaterThan(0)

    // Third call with MINIMIZE_TOTAL
    const result3 = await findOptimalLocationsResolver({
      locations: michiganAddresses,
      travelMode: 'DRIVING_CAR',
      optimizationGoal: 'MINIMIZE_TOTAL',
      topM: 5,
      gridSize: 5,
      deduplicationThreshold: 100,
    })

    expect(result3).toBeDefined()
    expect(result3.optimalPoints.length).toBeGreaterThan(0)
  }, 60000)
})
