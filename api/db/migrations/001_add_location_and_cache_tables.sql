-- Migration: Add location and cache tables for isochrone application
-- This migration adds the core data models needed for the application

-- Locations table for storing user-entered locations
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Isochrone cache table for storing calculated isochrones
CREATE TABLE isochrone_cache (
  id TEXT PRIMARY KEY,
  point_id TEXT NOT NULL,
  travel_time_minutes INTEGER NOT NULL,
  travel_mode TEXT NOT NULL CHECK (travel_mode IN ('DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING')),
  geojson TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

-- Matrix cache table for storing travel time matrices
CREATE TABLE matrix_cache (
  id TEXT PRIMARY KEY,
  origins_hash TEXT NOT NULL,
  destinations_hash TEXT NOT NULL,
  travel_mode TEXT NOT NULL CHECK (travel_mode IN ('DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING')),
  matrix_data TEXT NOT NULL, -- JSON serialized matrix data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

-- Geocoding cache table for storing address geocoding results
CREATE TABLE geocoding_cache (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

-- Performance indexes
CREATE INDEX idx_locations_coordinates ON locations(latitude, longitude);
CREATE INDEX idx_locations_created_at ON locations(created_at);

CREATE INDEX idx_isochrone_cache_lookup ON isochrone_cache(point_id, travel_time_minutes, travel_mode);
CREATE INDEX idx_isochrone_cache_expires ON isochrone_cache(expires_at);

CREATE INDEX idx_matrix_cache_lookup ON matrix_cache(origins_hash, destinations_hash, travel_mode);
CREATE INDEX idx_matrix_cache_expires ON matrix_cache(expires_at);

CREATE INDEX idx_geocoding_cache_address ON geocoding_cache(address);
CREATE INDEX idx_geocoding_cache_expires ON geocoding_cache(expires_at);
