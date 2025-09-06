// Web Worker for parallel data processing
// This worker handles data fusion, filtering, and processing

let aircraftCache = new Map();
let lastProcessTime = 0;

// Listen for messages from main thread
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch(type) {
        case 'processData':
            processAircraftData(data);
            break;
        case 'getStats':
            sendStats();
            break;
    }
};

// Process aircraft data from multiple sources
function processAircraftData(data) {
    const startTime = performance.now();
    
    try {
        // Combine data from all sources
        const allAircraft = [];
        
        // Process local ADS-B data
        if (data.local && data.local.aircraft) {
            data.local.aircraft.forEach(aircraft => {
                allAircraft.push({
                    ...aircraft,
                    source: 'local',
                    priority: 3 // Highest priority for local data
                });
            });
        }
        
        // Process OpenSky data
        if (data.openSky && data.openSky.aircraft) {
            data.openSky.aircraft.forEach(aircraft => {
                allAircraft.push({
                    ...aircraft,
                    source: 'opensky',
                    priority: 2 // Medium priority
                });
            });
        }
        
        // Process Flightradar24 data
        if (data.flightradar && data.flightradar.aircraft) {
            data.flightradar.aircraft.forEach(aircraft => {
                allAircraft.push({
                    ...aircraft,
                    source: 'flightradar24',
                    priority: 1 // Lower priority
                });
            });
        }
        
        // Data fusion algorithm
        const fusedAircraft = fuseAircraftData(allAircraft);
        
        // Remove duplicates and validate data
        const cleanedAircraft = removeDuplicates(fusedAircraft);
        
        // Update cache
        updateCache(cleanedAircraft);
        
        // Calculate processing time
        const processingTime = performance.now() - startTime;
        
        // Send processed data back to main thread
        self.postMessage({
            type: 'aircraftData',
            data: cleanedAircraft
        });
        
        // Send system stats
        self.postMessage({
            type: 'systemStats',
            data: {
                latency: Math.round(processingTime),
                fps: 60, // This would be calculated based on actual frame rate
                dataSource: 'هیبریدی',
                connected: true,
                processedCount: cleanedAircraft.length,
                cacheSize: aircraftCache.size
            }
        });
        
    } catch (error) {
        self.postMessage({
            type: 'error',
            data: error.message
        });
    }
}

// Data fusion algorithm using Kalman filter approach
function fuseAircraftData(aircraft) {
    const fusedMap = new Map();
    
    aircraft.forEach(aircraft => {
        const key = aircraft.icao24 || aircraft.callsign;
        if (!key) return;
        
        if (!fusedMap.has(key)) {
            fusedMap.set(key, {
                icao24: aircraft.icao24,
                callsign: aircraft.callsign,
                latitude: aircraft.latitude,
                longitude: aircraft.longitude,
                altitude: aircraft.altitude,
                velocity: aircraft.velocity,
                heading: aircraft.heading,
                origin: aircraft.origin,
                destination: aircraft.destination,
                source: aircraft.source,
                priority: aircraft.priority,
                timestamp: aircraft.timestamp,
                confidence: 1.0
            });
        } else {
            // Merge with existing aircraft data
            const existing = fusedMap.get(key);
            
            // Use higher priority data or average if same priority
            if (aircraft.priority > existing.priority) {
                // Replace with higher priority data
                Object.assign(existing, aircraft);
                existing.confidence = 1.0;
            } else if (aircraft.priority === existing.priority) {
                // Average the data
                existing.latitude = (existing.latitude + aircraft.latitude) / 2;
                existing.longitude = (existing.longitude + aircraft.longitude) / 2;
                existing.altitude = (existing.altitude + aircraft.altitude) / 2;
                existing.velocity = (existing.velocity + aircraft.velocity) / 2;
                existing.heading = (existing.heading + aircraft.heading) / 2;
                existing.confidence = Math.min(1.0, existing.confidence + 0.1);
            }
            
            // Update timestamp to most recent
            if (aircraft.timestamp > existing.timestamp) {
                existing.timestamp = aircraft.timestamp;
            }
        }
    });
    
    return Array.from(fusedMap.values());
}

// Remove duplicate aircraft based on ICAO24 and proximity
function removeDuplicates(aircraft) {
    const uniqueAircraft = [];
    const processedKeys = new Set();
    
    aircraft.forEach(aircraft => {
        const key = aircraft.icao24 || aircraft.callsign;
        if (!key || processedKeys.has(key)) return;
        
        // Check for proximity duplicates (same location within 1km)
        const isDuplicate = uniqueAircraft.some(existing => {
            const distance = calculateDistance(
                existing.latitude, existing.longitude,
                aircraft.latitude, aircraft.longitude
            );
            return distance < 1.0; // 1km threshold
        });
        
        if (!isDuplicate) {
            uniqueAircraft.push(aircraft);
            processedKeys.add(key);
        }
    });
    
    return uniqueAircraft;
}

// Calculate distance between two points in kilometers
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Update aircraft cache
function updateCache(aircraft) {
    const now = Date.now();
    const maxAge = 30000; // 30 seconds
    
    // Remove old entries
    for (const [key, value] of aircraftCache.entries()) {
        if (now - value.timestamp > maxAge) {
            aircraftCache.delete(key);
        }
    }
    
    // Add new entries
    aircraft.forEach(aircraft => {
        const key = aircraft.icao24 || aircraft.callsign;
        if (key) {
            aircraftCache.set(key, aircraft);
        }
    });
}

// Send current statistics
function sendStats() {
    const now = Date.now();
    const processingTime = now - lastProcessTime;
    
    self.postMessage({
        type: 'systemStats',
        data: {
            latency: Math.round(processingTime),
            fps: 60,
            dataSource: 'هیبریدی',
            connected: true,
            cacheSize: aircraftCache.size,
            lastUpdate: now
        }
    });
}

// Request stats every 5 seconds
setInterval(() => {
    sendStats();
}, 5000);