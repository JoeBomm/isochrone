// Initialize map
const map = L.map('map').setView([40.7128, -74.0060], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// Store locations and isochrone layers
let locations = [];
let markers = [];
let isochroneLayers = [];

// Colors for different locations
const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

/**
 * Add a location to the list
 */
function addLocation() {
    const input = document.getElementById('locationInput');
    const locationText = input.value.trim();
    
    if (!locationText) {
        showMessage('Please enter a location', 'warning');
        return;
    }
    
    // Check if it's coordinates (lat,lng)
    const coordMatch = locationText.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    
    if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            addLocationToMap(lat, lng, locationText);
            input.value = '';
        } else {
            showMessage('Invalid coordinates. Latitude must be -90 to 90, longitude -180 to 180', 'error');
        }
    } else {
        // Geocode address
        geocodeAddress(locationText, (lat, lng) => {
            addLocationToMap(lat, lng, locationText);
            input.value = '';
        });
    }
}

/**
 * Geocode an address to coordinates using Nominatim
 */
function geocodeAddress(address, callback) {
    showMessage('Geocoding address...', 'info');
    
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                callback(lat, lng);
                clearMessage();
            } else {
                showMessage('Address not found. Try coordinates (lat,lng) instead.', 'error');
            }
        })
        .catch(error => {
            console.error('Geocoding error:', error);
            showMessage('Error geocoding address. Try coordinates (lat,lng) instead.', 'error');
        });
}

/**
 * Add location to map and list
 */
function addLocationToMap(lat, lng, name) {
    const color = colors[locations.length % colors.length];
    
    const location = {
        lat: lat,
        lng: lng,
        name: name,
        color: color
    };
    
    locations.push(location);
    
    // Add marker
    const marker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);
    
    marker.bindPopup(`<strong>${name}</strong><br>${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    markers.push(marker);
    
    // Update list
    updateLocationList();
    
    // Fit map to markers
    if (locations.length > 0) {
        const bounds = L.latLngBounds(locations.map(loc => [loc.lat, loc.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

/**
 * Update the location list display
 */
function updateLocationList() {
    const listElement = document.getElementById('locationList');
    
    if (locations.length === 0) {
        listElement.innerHTML = '<div class="alert alert-info">No locations added yet</div>';
        return;
    }
    
    listElement.innerHTML = locations.map((loc, index) => `
        <div class="location-item">
            <div class="location-text">
                <span style="display: inline-block; width: 12px; height: 12px; background: ${loc.color}; border-radius: 50%; margin-right: 8px;"></span>
                ${loc.name}
            </div>
            <button class="btn btn-danger" onclick="removeLocation(${index})">Remove</button>
        </div>
    `).join('');
}

/**
 * Remove a location
 */
function removeLocation(index) {
    locations.splice(index, 1);
    
    // Remove marker
    if (markers[index]) {
        map.removeLayer(markers[index]);
        markers.splice(index, 1);
    }
    
    updateLocationList();
    
    // Clear isochrones when locations change
    clearIsochrones();
}

/**
 * Clear all isochrone layers
 */
function clearIsochrones() {
    isochroneLayers.forEach(layer => map.removeLayer(layer));
    isochroneLayers = [];
}

/**
 * Calculate isochrones for all locations
 */
async function calculateIsochrones() {
    if (locations.length === 0) {
        showMessage('Please add at least one location', 'warning');
        return;
    }
    
    const timeRange = parseInt(document.getElementById('timeRange').value);
    const profile = document.getElementById('profile').value;
    const btn = document.getElementById('calculateBtn');
    
    // Disable button
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Calculating...';
    
    // Clear existing isochrones
    clearIsochrones();
    
    showMessage(`Calculating isochrones for ${locations.length} location(s)...`, 'info');
    
    try {
        // Calculate isochrone for each location
        for (let i = 0; i < locations.length; i++) {
            const loc = locations[i];
            await calculateSingleIsochrone(loc, timeRange, profile);
        }
        
        showMessage(`Successfully calculated isochrones for ${locations.length} location(s)!`, 'info');
    } catch (error) {
        console.error('Error calculating isochrones:', error);
        showMessage('Error calculating isochrones. See instructions in README for API setup.', 'error');
    } finally {
        // Re-enable button
        btn.disabled = false;
        btn.innerHTML = 'Calculate Isochrones';
    }
}

/**
 * Calculate isochrone for a single location using OpenRouteService API
 */
async function calculateSingleIsochrone(location, timeRange, profile) {
    // Note: This uses the public OpenRouteService API demo endpoint
    // For production use, sign up for a free API key at https://openrouteservice.org/
    const apiKey = '5b3ce3597851110001cf6248a9f15f1bc1cd47b4a7ec81df19db55d2';
    
    const url = `https://api.openrouteservice.org/v2/isochrones/${profile}`;
    
    const body = {
        locations: [[location.lng, location.lat]],
        range: [timeRange * 60], // Convert minutes to seconds
        range_type: 'time'
    };
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey
        },
        body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Add isochrone to map
    if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        
        const layer = L.geoJSON(feature, {
            style: {
                color: location.color,
                weight: 2,
                opacity: 0.8,
                fillColor: location.color,
                fillOpacity: 0.2
            }
        }).addTo(map);
        
        layer.bindPopup(`
            <strong>${location.name}</strong><br>
            ${timeRange} minute ${profile.replace('-', ' ')} isochrone
        `);
        
        isochroneLayers.push(layer);
    }
}

/**
 * Show a message to the user
 */
function showMessage(text, type) {
    const messageArea = document.getElementById('messageArea');
    messageArea.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
}

/**
 * Clear the message area
 */
function clearMessage() {
    const messageArea = document.getElementById('messageArea');
    messageArea.innerHTML = '';
}

// Allow Enter key to add location
document.getElementById('locationInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addLocation();
    }
});

// Initialize with empty location list
updateLocationList();
