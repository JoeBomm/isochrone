# Design Document

## Overview

This design outlines the migration strategy for transforming the Isochrone Center Point application from RedwoodJS 8.9.0 to RedwoodSDK 1.x. The migration represents a fundamental architectural shift from a GraphQL-based full-stack framework to a lightweight, Cloudflare-focused SDK that emphasizes web-native primitives and React Server Components.

The migration will preserve all existing functionality while modernizing the architecture to leverage Cloudflare's edge computing capabilities, improve performance, and reduce complexity through web-standard APIs.

## Architecture

### Current Architecture (RedwoodJS)
```
┌─────────────────┐    ┌─────────────────┐
│   Web (React)   │    │   API (GraphQL) │
│                 │    │                 │
│ - Components    │◄──►│ - SDL Schemas   │
│ - Pages         │    │ - Services      │
│ - Routing       │    │ - Resolvers     │
└─────────────────┘    └─────────────────┘
         │                       │
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   Vite Build    │    │ Prisma + SQLite │
│                 │    │                 │
│ - Bundle Web    │    │ - ORM Layer     │
│ - Static Assets │    │ - Migrations    │
└─────────────────┘    └─────────────────┘
```

### Target Architecture (RedwoodSDK)
```
┌─────────────────────────────────────────┐
│         Cloudflare Workers              │
│                                         │
│ ┌─────────────┐  ┌─────────────────────┐│
│ │ RSC Server  │  │  Server Functions   ││
│ │             │  │                     ││
│ │ - SSR       │  │ - API Endpoints     ││
│ │ - Streaming │  │ - Business Logic    ││
│ └─────────────┘  └─────────────────────┘│
└─────────────────────────────────────────┘
         │                       │
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│ Client (React)  │    │ Cloudflare D1   │
│                 │    │                 │
│ - Hydration     │    │ - SQLite Edge   │
│ - Interactivity │    │ - Native Queries│
└─────────────────┘    └─────────────────┘
```

## Components and Interfaces

### 1. Application Entry Point

**RedwoodSDK Worker Definition**
```typescript
// worker.ts
import { defineApp } from "rwsdk/worker"
import { route } from "rwsdk/router"
import { sessionMiddleware } from "./middleware/session"
import { HomePage } from "./pages/HomePage"

export default defineApp([
  // Global middleware
  sessionMiddleware,

  // Route handlers
  route("/", HomePage),
  route("/api/isochrones", isochroneHandler),
  route("/api/locations", locationHandler),
])
```

**Request Context Interface**
```typescript
interface AppContext {
  session?: Session
  user?: User
  env: CloudflareEnv
  db: D1Database
}

interface CloudflareEnv {
  OPENROUTE_SERVICE_API_KEY: string
  D1_DATABASE: D1Database
  R2_BUCKET?: R2Bucket
}
```

### 2. Server Functions Architecture

**Isochrone Server Functions**
```typescript
// server/isochrones.ts
"use server"

import { getRequestInfo } from "rwsdk/worker"

export async function findOptimalLocations(
  locations: LocationInput[],
  travelMode: TravelMode,
  optimizationGoal: OptimizationGoal = "MINIMAX"
): Promise<OptimalLocationResult> {
  const { ctx } = getRequestInfo()

  // Business logic from current isochrones service
  const result = await calculateOptimalLocations(
    locations,
    travelMode,
    optimizationGoal,
    ctx.db
  )

  return result
}

export async function generateIsochrone(
  pointId: string,
  travelTimeMinutes: number,
  travelMode: TravelMode
): Promise<GeoJSONPolygon> {
  const { ctx } = getRequestInfo()

  // Migrate existing isochrone generation logic
  return await createIsochrone(pointId, travelTimeMinutes, travelMode, ctx.db)
}
```

**Location Server Functions**
```typescript
// server/locations.ts
"use server"

import { getRequestInfo } from "rwsdk/worker"

export async function geocodeLocation(
  address: string
): Promise<LocationResult> {
  const { ctx } = getRequestInfo()

  // Use native fetch instead of GraphQL client
  const response = await fetch(
    `https://api.openrouteservice.org/geocode/search?api_key=${ctx.env.OPENROUTE_SERVICE_API_KEY}&text=${encodeURIComponent(address)}`
  )

  return await response.json()
}
```

### 3. Database Layer Migration

**D1 Database Schema**
```sql
-- migrations/001_initial_schema.sql
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS isochrone_cache (
  id TEXT PRIMARY KEY,
  point_id TEXT NOT NULL,
  travel_time_minutes INTEGER NOT NULL,
  travel_mode TEXT NOT NULL,
  geojson TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

CREATE INDEX idx_isochrone_cache_lookup
ON isochrone_cache(point_id, travel_time_minutes, travel_mode);
```

**Database Access Layer**
```typescript
// lib/database.ts
import { getRequestInfo } from "rwsdk/worker"

export class DatabaseService {
  private get db() {
    const { ctx } = getRequestInfo()
    return ctx.env.D1_DATABASE
  }

  async saveLocation(location: LocationInput): Promise<string> {
    const id = crypto.randomUUID()

    await this.db.prepare(`
      INSERT INTO locations (id, address, latitude, longitude)
      VALUES (?, ?, ?, ?)
    `).bind(id, location.address, location.latitude, location.longitude).run()

    return id
  }

  async getCachedIsochrone(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: string
  ): Promise<GeoJSONPolygon | null> {
    const result = await this.db.prepare(`
      SELECT geojson FROM isochrone_cache
      WHERE point_id = ? AND travel_time_minutes = ? AND travel_mode = ?
      AND expires_at > datetime('now')
    `).bind(pointId, travelTimeMinutes, travelMode).first()

    return result ? JSON.parse(result.geojson as string) : null
  }
}
```

### 4. React Server Components

**HomePage RSC**
```typescript
// pages/HomePage.tsx
import { LocationInput } from "../components/LocationInput"
import { Map } from "../components/Map"
import { IsochroneControls } from "../components/IsochroneControls"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Isochrone Center Point
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <LocationInput />
            <IsochroneControls />
          </div>

          <div className="lg:col-span-2">
            <Map />
          </div>
        </div>
      </main>
    </div>
  )
}
```

**Client Components**
```typescript
// components/LocationInput.tsx
"use client"

import { useState } from "react"
import { geocodeLocation } from "../server/locations"

export function LocationInput() {
  const [address, setAddress] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await geocodeLocation(address)
      // Handle result
    } catch (error) {
      console.error("Geocoding failed:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Enter an address..."
        className="w-full px-3 py-2 border border-gray-300 rounded-md"
      />
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? "Geocoding..." : "Add Location"}
      </button>
    </form>
  )
}
```

### 5. External Service Integration

**OpenRouteService Client**
```typescript
// lib/openroute.ts
import { getRequestInfo } from "rwsdk/worker"

export class OpenRouteService {
  private get apiKey() {
    const { ctx } = getRequestInfo()
    return ctx.env.OPENROUTE_SERVICE_API_KEY
  }

  async generateIsochrone(
    coordinate: [number, number],
    travelTimeMinutes: number,
    travelMode: TravelMode
  ): Promise<GeoJSONPolygon> {
    const response = await fetch(
      "https://api.openrouteservice.org/v2/isochrones/" + this.getTravelProfile(travelMode),
      {
        method: "POST",
        headers: {
          "Authorization": this.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locations: [coordinate],
          range: [travelTimeMinutes * 60], // Convert to seconds
          range_type: "time"
        })
      }
    )

    if (!response.ok) {
      throw new Error(`OpenRouteService API error: ${response.status}`)
    }

    const data = await response.json()
    return data.features[0].geometry
  }

  private getTravelProfile(mode: TravelMode): string {
    switch (mode) {
      case "DRIVING_CAR": return "driving-car"
      case "CYCLING_REGULAR": return "cycling-regular"
      case "FOOT_WALKING": return "foot-walking"
      default: return "driving-car"
    }
  }
}
```

### 6. Caching Strategy

**Cloudflare Cache Integration**
```typescript
// lib/cache.ts
export class CacheService {
  private static CACHE_NAME = "isochrone-cache"

  async get<T>(key: string): Promise<T | null> {
    const cache = await caches.open(CacheService.CACHE_NAME)
    const response = await cache.match(key)

    if (!response) return null

    const data = await response.json()
    return data.value
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    const cache = await caches.open(CacheService.CACHE_NAME)
    const expiresAt = Date.now() + (ttlSeconds * 1000)

    const response = new Response(JSON.stringify({
      value,
      expiresAt
    }), {
      headers: {
        "Cache-Control": `max-age=${ttlSeconds}`,
        "Content-Type": "application/json"
      }
    })

    await cache.put(key, response)
  }
}
```

## Data Models

### Core Types (Preserved from RedwoodJS)
```typescript
// types/index.ts
export interface LocationInput {
  address: string
  latitude: number
  longitude: number
}

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface OptimalLocationResult {
  optimalPoints: OptimalPoint[]
  debugPoints: DebugPoint[]
  matrixApiCalls: number
  totalHypothesisPoints: number
}

export interface OptimalPoint {
  id: string
  coordinate: Coordinate
  travelTimeMetrics: TravelTimeMetrics
  rank: number
}

export interface TravelTimeMetrics {
  maxTravelTime: number
  averageTravelTime: number
  variance: number
  totalTravelTime: number
}

export type TravelMode = "DRIVING_CAR" | "CYCLING_REGULAR" | "FOOT_WALKING"
export type OptimizationGoal = "MINIMAX" | "MINIMIZE_VARIANCE" | "MINIMIZE_TOTAL"
export type GeoJSONPolygon = any // Preserve existing GeoJSON type
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Now I need to use the prework tool to analyze the acceptance criteria before writing the correctness properties.

### Property Reflection

After analyzing all acceptance criteria, I identified several areas where properties can be consolidated:

- Schema conversion and data access properties (2.1, 2.2) can be combined into a comprehensive database migration property
- API conversion properties (3.1, 3.2, 3.3) can be consolidated into a single functional equivalence property
- Component migration properties (4.1, 4.2) can be combined into a component classification property
- Performance properties (7.1, 7.2, 7.3, 7.4, 7.5) can be consolidated into a comprehensive performance preservation property
- External service properties (5.1, 5.2, 5.3, 5.4) can be combined into an external integration property

This consolidation reduces redundancy while maintaining comprehensive coverage of all testable requirements.

### Converting EARS to Properties

Based on the prework analysis, here are the consolidated correctness properties:

**Property 1: Database Schema Migration Equivalence**
*For any* Prisma schema definition, converting it to D1 schema and then performing equivalent operations should produce the same data structure and relationships
**Validates: Requirements 2.1, 2.2, 2.5**

**Property 2: API Functional Equivalence**
*For any* GraphQL mutation in the original system, the corresponding server function should accept the same inputs and produce equivalent outputs
**Validates: Requirements 3.1, 3.3, 3.5**

**Property 3: Component Classification Correctness**
*For any* React component, the migration system should correctly identify whether it requires client-side interactivity and apply the appropriate "use client" directive or RSC designation
**Validates: Requirements 4.1, 4.2**

**Property 4: Route Functionality Preservation**
*For any* route in the original RedwoodJS application, the migrated RedwoodSDK route should handle the same URL patterns and produce equivalent responses
**Validates: Requirements 4.3, 4.5**

**Property 5: External Service Integration Consistency**
*For any* external API call, the migrated system using native fetch should produce the same results as the original GraphQL client implementation
**Validates: Requirements 5.1, 5.3, 5.4**

**Property 6: Caching Behavior Equivalence**
*For any* cacheable operation, the Cloudflare cache implementation should provide the same cache hit/miss behavior and data consistency as the original Redis implementation
**Validates: Requirements 5.2**

**Property 7: Performance Preservation**
*For any* user operation (page load, API call, geospatial calculation), the migrated system should achieve response times and accuracy equal to or better than the original implementation
**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

**Property 8: Test Migration Completeness**
*For any* existing Jest test, the migrated test should continue to pass and validate the same functionality in the new architecture
**Validates: Requirements 6.3, 8.3**

**Property 9: Migration Adapter Compatibility**
*For any* gradual migration step, the adapter layer should allow both old and new systems to coexist and function correctly during the transition period
**Validates: Requirements 8.2**

**Property 10: Rollback Integrity**
*For any* migration state, executing the rollback procedure should restore the system to the exact previous working state without data loss or functionality degradation
**Validates: Requirements 8.5**

## Error Handling

### Migration Error Categories

1. **Schema Conversion Errors**
   - Unsupported Prisma features in D1
   - Data type mapping failures
   - Relationship constraint violations

2. **API Conversion Errors**
   - GraphQL to Server Function mapping failures
   - Context object access errors
   - Authentication/authorization failures

3. **Component Migration Errors**
   - Incorrect RSC/Client component classification
   - State management conflicts
   - Hydration mismatches

4. **Runtime Environment Errors**
   - Cloudflare Workers limitations
   - D1 database connection failures
   - Cache API access errors

### Error Recovery Strategies

**Graceful Degradation**
- Fallback to original RedwoodJS implementation for failed migrations
- Temporary adapter layers to maintain functionality during partial migrations
- Progressive enhancement approach for new features

**Validation and Testing**
- Comprehensive test suite to catch migration errors early
- Automated comparison testing between old and new implementations
- Performance benchmarking to ensure no regressions

**Rollback Mechanisms**
- Database migration rollback scripts
- Code deployment rollback procedures
- Configuration rollback capabilities

## Testing Strategy

### Dual Testing Approach

The migration requires both unit testing and property-based testing to ensure comprehensive coverage:

**Unit Tests**
- Specific migration scenarios and edge cases
- Integration points between RedwoodJS and RedwoodSDK components
- Error conditions and recovery mechanisms
- Configuration and setup validation

**Property-Based Tests**
- Universal properties that must hold across all migration scenarios
- Comprehensive input coverage through randomization
- Functional equivalence validation between old and new systems
- Performance and accuracy preservation verification

### Property-Based Testing Configuration

- **Testing Library**: fast-check for TypeScript/JavaScript property-based testing
- **Test Iterations**: Minimum 100 iterations per property test
- **Test Tagging**: Each property test tagged with format: **Feature: redwoodjs-to-redwoodsdk-migration, Property {number}: {property_text}**
- **Coverage Requirements**: Each correctness property implemented by a single property-based test

### Migration Testing Phases

1. **Pre-Migration Testing**
   - Baseline performance and functionality measurements
   - Comprehensive test suite for existing RedwoodJS application
   - Data integrity verification

2. **During Migration Testing**
   - Incremental testing of each migration step
   - Adapter layer functionality validation
   - Rollback procedure testing

3. **Post-Migration Testing**
   - Full functionality verification in RedwoodSDK
   - Performance comparison with baseline
   - End-to-end user workflow testing

### Test Environment Setup

**Local Development**
- Miniflare for Cloudflare Workers emulation
- Local D1 database for testing
- Mock external services for isolated testing

**Staging Environment**
- Full Cloudflare Workers deployment
- Production-like D1 database
- Real external service integration

**Production Validation**
- Blue-green deployment for safe testing
- Gradual traffic migration
- Real-time monitoring and alerting
