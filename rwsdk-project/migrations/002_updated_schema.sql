-- Updated D1 schema to match Prisma models exactly
-- This ensures compatibility between RedwoodJS and RedwoodSDK versions

-- Drop existing tables to recreate with exact structure
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS isochrone_cache;
DROP TABLE IF EXISTS optimal_location_results;

-- Locations table (matches Prisma Location model)
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Isochrone cache table (matches Prisma IsochroneCache model)
CREATE TABLE isochrone_cache (
  id TEXT PRIMARY KEY,
  point_id TEXT NOT NULL,
  travel_time_minutes INTEGER NOT NULL,
  travel_mode TEXT NOT NULL CHECK (travel_mode IN ('DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING')),
  geojson TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

-- Matrix cache table (matches Prisma MatrixCache model)
CREATE TABLE matrix_cache (
  id TEXT PRIMARY KEY,
  origins_hash TEXT NOT NULL,
  destinations_hash TEXT NOT NULL,
  travel_mode TEXT NOT NULL CHECK (travel_mode IN ('DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING')),
  matrix_data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

-- Geocoding cache table (matches Prisma GeocodingCache model)
CREATE TABLE geocoding_cache (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

-- Performance indexes (matching Prisma indexes)
CREATE INDEX idx_locations_coordinates ON locations(latitude, longitude);
CREATE INDEX idx_locations_created_at ON locations(created_at);

CREATE INDEX idx_isochrone_cache_lookup ON isochrone_cache(point_id, travel_time_minutes, travel_mode);
CREATE INDEX idx_isochrone_cache_expires ON isochrone_cache(expires_at);

CREATE INDEX idx_matrix_cache_lookup ON matrix_cache(origins_hash, destinations_hash, travel_mode);
CREATE INDEX idx_matrix_cache_expires ON matrix_cache(expires_at);

CREATE INDEX idx_geocoding_cache_address ON geocoding_cache(address);
CREATE INDEX idx_geocoding_cache_expires ON geocoding_cache(expires_at);
