# Product Overview

**Isochrone Center Point** is a geospatial application that calculates optimal meeting locations based on travel time accessibility. 

## Core Functionality

The application finds fair meeting points by:
- Accepting multiple location inputs from users
- Calculating isochrones (areas reachable within a given travel time) for each location
- Determining the optimal center point that minimizes travel time for all participants
- Supporting multiple travel modes: driving, cycling, and walking
- Providing configurable buffer times (5-60 minutes) for travel flexibility

## Key Features

- **Multi-modal Travel Analysis**: Supports driving, cycling, and walking travel modes
- **Geospatial Calculations**: Uses Turf.js for geometric operations (centroid, union)
- **Interactive Mapping**: Leaflet integration for map visualization
- **Address Geocoding**: Converts addresses to coordinates via OpenRouteService
- **Performance Optimization**: Redis caching for API responses and calculations

## Target Use Cases

- Planning team meetings across distributed locations
- Finding optimal venues for social gatherings
- Business location analysis for accessibility
- Urban planning and transportation studies