-- Initial database schema for RedwoodSDK migration
-- This schema mirrors the existing Prisma schema structure

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_locations_coordinates
ON locations(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_isochrone_cache_lookup
ON isochrone_cache(point_id, travel_time_minutes, travel_mode);

CREATE INDEX IF NOT EXISTS idx_isochrone_cache_expires
ON isochrone_cache(expires_at);

-- Optional: Add a table for storing calculation results
CREATE TABLE IF NOT EXISTS optimal_location_results (
  id TEXT PRIMARY KEY,
  input_locations TEXT NOT NULL, -- JSON array of input locations
  travel_mode TEXT NOT NULL,
  optimization_goal TEXT NOT NULL,
  result_data TEXT NOT NULL, -- JSON result data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_optimal_results_params
ON optimal_location_results(travel_mode, optimization_goal);
