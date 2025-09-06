let map;
let aircraftMarkers = new Map();
let dataWorker;
let is3DMode = false;
let selectedAircraft = null;
let animationId;
let lastFrameTime = 0;
let frameCount = 0;
let fps = 60;
let http3Client;
let dataConnection;

// Initialize the map
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 35.6892, lng: 51.3890 }, // Tehran coordinates
        zoom: 8,
        mapId: 'DEMO_MAP_ID', // Required for 3D features
        mapTypeId: 'satellite',
        tilt: 45, // Enable 3D view
        heading: 0,
        styles: [
            {
                featureType: 'all',
                elementType: 'geometry.fill',
                stylers: [{ color: '#1a1a2e' }]
            },
            {
                featureType: 'water',
                elementType: 'geometry.fill',
                stylers: [{ color: '#16213e' }]
            }
        ]
    });

    // Initialize HTTP/3 client
    initHTTP3Client();
    
    // Initialize Web Worker for data processing
    initDataWorker();
    
    // Start data collection
    startDataCollection();
    
    // Hide loading screen
    document.getElementById('loading').style.display = 'none';
    
    // Start FPS counter
    startFPSCounter();
}

// Initialize HTTP/3 client for low-latency data streaming
function initHTTP3Client() {
    http3Client = new HTTP3Client();
    http3Client.startCleanup();
    
    // Create data connection
    createDataConnection();
}

// Create HTTP/3 connection for data streaming
async function createDataConnection() {
    try {
        dataConnection = await http3Client.createConnection('/api/aircraft-data', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        console.log('HTTP/3 data connection established:', dataConnection.id);
        
        // Create stream for real-time data
        const dataStream = await http3Client.createStream(dataConnection.id, {
            realTime: true,
            interval: 1000
        });
        
        // Start receiving data
        startDataStreaming(dataStream.id);
        
    } catch (error) {
        console.error('Failed to create HTTP/3 connection:', error);
        // Fallback to regular polling
        console.log('Falling back to regular data polling');
    }
}

// Start streaming data through HTTP/3
async function startDataStreaming(streamId) {
    try {
        while (true) {
            const data = await http3Client.receiveData(streamId);
            
            // Process received data
            if (data && data.aircraft) {
                dataWorker.postMessage({
                    type: 'processData',
                    data: {
                        http3: data,
                        timestamp: Date.now()
                    }
                });
            }
            
            // Wait before next request
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        console.error('Data streaming error:', error);
        // Fallback to regular polling
        startDataCollection();
    }
}

// Initialize Web Worker for parallel data processing
function initDataWorker() {
    dataWorker = new Worker('data-worker.js');
    
    dataWorker.onmessage = function(e) {
        const { type, data } = e.data;
        
        switch(type) {
            case 'aircraftData':
                updateAircraftDisplay(data);
                break;
            case 'systemStats':
                updateSystemStats(data);
                break;
            case 'error':
                console.error('Worker error:', data);
                break;
        }
    };
}

// Start data collection from multiple sources
function startDataCollection() {
    // Simulate data collection from multiple sources
    setInterval(() => {
        collectDataFromSources();
    }, 1000); // Update every second
}

// Collect data from hybrid sources
async function collectDataFromSources() {
    try {
        // Simulate data from local ADS-B receiver
        const localData = await fetchLocalADS_BData();
        
        // Simulate data from OpenSky Network
        const openSkyData = await fetchOpenSkyData();
        
        // Simulate data from Flightradar24
        const flightradarData = await fetchFlightradar24Data();
        
        // Send to worker for processing
        dataWorker.postMessage({
            type: 'processData',
            data: {
                local: localData,
                openSky: openSkyData,
                flightradar: flightradarData,
                timestamp: Date.now()
            }
        });
    } catch (error) {
        console.error('Error collecting data:', error);
    }
}

// Simulate local ADS-B data
async function fetchLocalADS_BData() {
    // In real implementation, this would connect to local RTL-SDR
    return {
        source: 'local',
        aircraft: generateMockAircraft(5, 'local')
    };
}

// Simulate OpenSky Network data
async function fetchOpenSkyData() {
    try {
        const response = await fetch('https://opensky-network.org/api/states/all');
        const data = await response.json();
        return {
            source: 'opensky',
            aircraft: data.states ? data.states.map(state => ({
                icao24: state[0],
                callsign: state[1],
                origin: state[2],
                timePosition: state[3],
                lastContact: state[4],
                longitude: state[5],
                latitude: state[6],
                baroAltitude: state[7],
                onGround: state[8],
                velocity: state[9],
                trueTrack: state[10],
                verticalRate: state[11],
                sensors: state[12],
                geoAltitude: state[13],
                squawk: state[14],
                spi: state[15],
                positionSource: state[16]
            })) : []
        };
    } catch (error) {
        console.error('OpenSky API error:', error);
        return { source: 'opensky', aircraft: [] };
    }
}

// Simulate Flightradar24 data
async function fetchFlightradar24Data() {
    // In real implementation, this would use Flightradar24 API
    return {
        source: 'flightradar24',
        aircraft: generateMockAircraft(10, 'flightradar24')
    };
}

// Generate mock aircraft data for testing
function generateMockAircraft(count, source) {
    const aircraft = [];
    const callsigns = ['IR123', 'WZ456', 'EP789', 'TK012', 'LH345', 'BA678', 'AF901', 'KL234', 'LX567', 'OS890'];
    
    for (let i = 0; i < count; i++) {
        const lat = 35.6892 + (Math.random() - 0.5) * 2; // Around Tehran
        const lng = 51.3890 + (Math.random() - 0.5) * 2;
        
        aircraft.push({
            icao24: Math.random().toString(36).substr(2, 6).toUpperCase(),
            callsign: callsigns[Math.floor(Math.random() * callsigns.length)],
            latitude: lat,
            longitude: lng,
            altitude: Math.floor(Math.random() * 40000) + 1000,
            velocity: Math.floor(Math.random() * 800) + 100,
            heading: Math.floor(Math.random() * 360),
            origin: 'THR',
            destination: 'IKA',
            source: source,
            timestamp: Date.now()
        });
    }
    
    return aircraft;
}

// Update aircraft display on map
function updateAircraftDisplay(aircraftData) {
    // Remove old markers
    aircraftMarkers.forEach(marker => marker.setMap(null));
    aircraftMarkers.clear();
    
    // Add new markers
    aircraftData.forEach(aircraft => {
        const marker = new google.maps.Marker({
            position: { lat: aircraft.latitude, lng: aircraft.longitude },
            map: map,
            title: aircraft.callsign,
            icon: {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 3,
                fillColor: getAircraftColor(aircraft.source),
                fillOpacity: 0.8,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                rotation: aircraft.heading
            }
        });
        
        // Add click listener
        marker.addListener('click', () => {
            showAircraftInfo(aircraft);
        });
        
        aircraftMarkers.set(aircraft.icao24, marker);
    });
    
    // Update active aircraft count
    document.getElementById('activeAircraft').textContent = aircraftData.length;
}

// Get aircraft color based on source
function getAircraftColor(source) {
    switch(source) {
        case 'local': return '#00ff00';
        case 'opensky': return '#00d4ff';
        case 'flightradar24': return '#ff6b6b';
        default: return '#ffffff';
    }
}

// Show aircraft information panel
function showAircraftInfo(aircraft) {
    selectedAircraft = aircraft;
    document.getElementById('aircraftCallsign').textContent = aircraft.callsign;
    document.getElementById('aircraftAltitude').textContent = aircraft.altitude + ' ft';
    document.getElementById('aircraftSpeed').textContent = aircraft.velocity + ' kts';
    document.getElementById('aircraftHeading').textContent = aircraft.heading + '°';
    document.getElementById('aircraftOrigin').textContent = aircraft.origin || '-';
    document.getElementById('aircraftDestination').textContent = aircraft.destination || '-';
    document.getElementById('aircraftInfo').style.display = 'block';
}

// Open 3D view
function open3DView() {
    if (selectedAircraft) {
        window.open(`gmp-3d-view.html?icao24=${selectedAircraft.icao24}&lat=${selectedAircraft.latitude}&lng=${selectedAircraft.longitude}&alt=${selectedAircraft.altitude}&heading=${selectedAircraft.heading}`, '_blank');
    }
}

// Update system statistics
function updateSystemStats(stats) {
    document.getElementById('systemLatency').textContent = stats.latency + 'ms';
    document.getElementById('fps').textContent = stats.fps + ' FPS';
    document.getElementById('dataSource').textContent = stats.dataSource;
    document.getElementById('connectionStatus').textContent = stats.connected ? 'متصل' : 'قطع';
}

// Start FPS counter
function startFPSCounter() {
    function countFPS() {
        const now = performance.now();
        frameCount++;
        
        if (now - lastFrameTime >= 1000) {
            fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
            frameCount = 0;
            lastFrameTime = now;
        }
        
        animationId = requestAnimationFrame(countFPS);
    }
    
    countFPS();
}

// Control button handlers
document.getElementById('toggleData').addEventListener('click', function() {
    this.classList.toggle('active');
    // Toggle data source logic
});

document.getElementById('toggleFilter').addEventListener('click', function() {
    this.classList.toggle('active');
    // Toggle aircraft filter logic
});

document.getElementById('toggleTrails').addEventListener('click', function() {
    this.classList.toggle('active');
    // Toggle flight trails logic
});

document.getElementById('toggle3D').addEventListener('click', function() {
    this.classList.toggle('active');
    is3DMode = !is3DMode;
    if (is3DMode) {
        map.setTilt(45);
        map.setHeading(0);
    } else {
        map.setTilt(0);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (dataWorker) {
        dataWorker.terminate();
    }
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
});