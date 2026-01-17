# Isochrone Map

Find equal driving distance areas for multiple locations on a map.

## Overview

This is a simple MVP web application that visualizes isochrones (equal travel time areas) for N coordinate/address locations on an interactive map. An isochrone shows the area you can reach from a given point within a specified travel time.

## Features

- 🗺️ Interactive map interface using Leaflet
- 📍 Add multiple locations by address or coordinates
- ⏱️ Calculate isochrones for customizable travel times (1-60 minutes)
- 🚗 Multiple travel modes: driving, cycling, walking
- 🎨 Color-coded visualization for each location
- 🌐 Address geocoding support

## Quick Start

1. Open `index.html` in a web browser
2. Add locations by entering addresses or coordinates
3. Set your desired travel time and mode
4. Click "Calculate Isochrones" to visualize equal travel time areas

### Using with a Local Server

For the best experience, serve the application using a local web server:

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js (install http-server first: npm install -g http-server)
http-server -p 8000

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## How to Use

### Adding Locations

**By Address:**
- Enter a location name or address (e.g., "New York, NY" or "Times Square")
- Click "Add Location"

**By Coordinates:**
- Enter coordinates in the format: `latitude,longitude` (e.g., "40.7128,-74.0060")
- Click "Add Location"

### Calculating Isochrones

1. Add one or more locations to the map
2. Set the travel time (in minutes) you want to visualize
3. Choose a travel mode (driving, cycling, or walking)
4. Click "Calculate Isochrones"

The map will display colored polygons showing the areas reachable within your specified time from each location.

### Understanding the Map

- **Colored circles** represent your added locations
- **Colored polygons** show the isochrone areas (regions reachable within the specified travel time)
- **Same colors** indicate which isochrone belongs to which location
- Click on markers or polygons to see more details

## API Information

This application uses the [OpenRouteService API](https://openrouteservice.org/) for isochrone calculations. The included API key is for demonstration purposes only and has rate limits.

### Getting Your Own API Key (Recommended)

For production use or heavy usage, get a free API key:

1. Visit [https://openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup)
2. Sign up for a free account
3. Get your API key from the dashboard
4. Replace the `apiKey` value in `app.js` (around line 207)

Free tier includes:
- 2,000 requests per day
- 40 requests per minute

## Technologies Used

- **Leaflet.js** - Interactive map library
- **OpenStreetMap** - Map tiles
- **OpenRouteService** - Isochrone calculation API
- **Nominatim** - Address geocoding

## Example Use Cases

- **Real Estate**: Find areas within commuting distance of multiple job locations
- **Urban Planning**: Analyze accessibility to services or amenities
- **Business**: Identify service areas for multiple locations
- **Emergency Services**: Visualize response time coverage
- **Logistics**: Plan delivery zones

## Limitations

- API rate limits apply (see API Information above)
- Maximum travel time: 60 minutes
- Requires internet connection for map tiles and API calls
- Isochrones are calculated based on road network data and typical travel speeds

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

## License

MIT License - Feel free to use and modify as needed.

## Contributing

This is a simple MVP. Potential improvements:
- Offline support
- Save/load location sets
- Export isochrone data
- Multiple time ranges simultaneously
- Intersection analysis (find areas reachable from all locations)
- Custom API endpoint configuration
