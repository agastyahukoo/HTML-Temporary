// Mission Planner - Professional UAV Flight Planning System

class MissionPlanner {
    constructor(droneManager) {
        this.droneManager = droneManager;
        this.map = null;
        this.waypoints = [];
        this.pathPolyline = null;
        this.smoothPathPolyline = null;
        this.markers = [];
        this.selectedDrone = null;
        this.homePoint = null;
        this.isAddingWaypoint = true;
        
        // Mission parameters
        this.defaultAltitude = 50;
        this.defaultSpeed = 0;
        this.safetyReserve = 20;
        this.windSpeed = 0;
        
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.initMap();
        this.setupEventListeners();
        this.loadDroneList();
        
        // Handle view visibility changes for map resize
        this.setupViewObserver();
    }
    
    setupViewObserver() {
        // Listen for view changes
        const missionView = document.getElementById('mission-view');
        if (!missionView) return;
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const isActive = missionView.classList.contains('active');
                    if (isActive && this.map) {
                        setTimeout(() => {
                            this.map.invalidateSize();
                        }, 100);
                    }
                }
            });
        });
        
        observer.observe(missionView, { attributes: true });
    }

    // Map Initialization
    initMap() {
        // Initialize map centered on default location
        this.map = L.map('map', {
            center: [37.7749, -122.4194], // San Francisco default
            zoom: 13,
            zoomControl: true
        });

        // Add dark tile layer (CartoDB Dark Matter)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CartoDB',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.map);

        // Map click event for adding waypoints
        this.map.on('click', (e) => {
            if (this.isAddingWaypoint) {
                this.addWaypoint(e.latlng.lat, e.latlng.lng);
            }
        });

        // Mouse move event for coordinate display
        this.map.on('mousemove', (e) => {
            this.updateCoordinatesDisplay(e.latlng);
        });

        // Try to get user's location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    this.map.setView([latitude, longitude], 13);
                },
                () => {
                    console.log('Could not get user location, using default');
                }
            );
        }
    }

    updateCoordinatesDisplay(latlng) {
        const display = document.getElementById('coordinates-display');
        display.textContent = `Lat: ${latlng.lat.toFixed(6)}, Lon: ${latlng.lng.toFixed(6)}`;
    }

    // Event Listeners
    setupEventListeners() {
        // Drone selection
        document.getElementById('mission-drone-select').addEventListener('change', (e) => {
            this.selectDrone(e.target.value);
        });

        // Mission parameters
        document.getElementById('default-altitude').addEventListener('input', (e) => {
            this.defaultAltitude = parseFloat(e.target.value);
            this.updateMissionSummary();
        });

        document.getElementById('default-speed').addEventListener('input', (e) => {
            this.defaultSpeed = parseFloat(e.target.value) || 0;
            this.updateMissionSummary();
        });

        document.getElementById('safety-reserve').addEventListener('input', (e) => {
            this.safetyReserve = parseFloat(e.target.value);
            this.updateMissionSummary();
        });

        document.getElementById('wind-speed').addEventListener('input', (e) => {
            this.windSpeed = parseFloat(e.target.value);
            this.updateMissionSummary();
        });

        // Mission actions
        document.getElementById('clear-mission-btn').addEventListener('click', () => {
            this.clearMission();
        });

        document.getElementById('set-home-btn').addEventListener('click', () => {
            this.setHomePoint();
        });

        document.getElementById('add-rtl-btn').addEventListener('click', () => {
            this.addReturnToLaunch();
        });

        document.getElementById('optimize-path-btn').addEventListener('click', () => {
            this.optimizePath();
        });

        document.getElementById('export-mission-btn').addEventListener('click', () => {
            this.exportMission();
        });

        document.getElementById('import-mission-input').addEventListener('change', (e) => {
            this.importMission(e.target.files[0]);
        });

        // Save/Load missions
        document.getElementById('save-mission-btn').addEventListener('click', () => {
            this.saveMission();
        });

        document.getElementById('load-missions-btn').addEventListener('click', () => {
            this.showSavedMissions();
        });

        document.getElementById('close-saved-missions-btn')?.addEventListener('click', () => {
            this.hideSavedMissions();
        });

        // Map controls
        document.getElementById('locate-btn').addEventListener('click', () => {
            this.locateUser();
        });

        document.getElementById('search-location').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchLocation(e.target.value);
            }
        });
    }

    // Drone Management
    loadDroneList() {
        const select = document.getElementById('mission-drone-select');
        const drones = this.droneManager.getAllDrones();
        
        select.innerHTML = '<option value="">Select a drone profile</option>';
        
        drones.forEach(drone => {
            const option = document.createElement('option');
            option.value = drone.id;
            option.textContent = `${drone.name} (${drone.type})`;
            select.appendChild(option);
        });
    }

    selectDrone(droneId) {
        if (!droneId) {
            this.selectedDrone = null;
            document.getElementById('selected-drone-info').style.display = 'none';
            this.updateActionButtons();
            this.updateMissionSummary();
            return;
        }

        this.selectedDrone = this.droneManager.getDroneById(droneId);
        
        if (this.selectedDrone) {
            // Display drone info
            document.getElementById('info-type').textContent = this.selectedDrone.type;
            document.getElementById('info-weight').textContent = `${this.selectedDrone.weight} kg`;
            document.getElementById('info-flight-time').textContent = 
                this.selectedDrone.maxFlightTime ? `${this.selectedDrone.maxFlightTime} min` : 'N/A';
            document.getElementById('info-cruise-speed').textContent = 
                `${this.selectedDrone.cruiseSpeed} m/s`;
            
            document.getElementById('selected-drone-info').style.display = 'block';
            
            // Set default speed to cruise speed if not set
            if (this.defaultSpeed === 0) {
                this.defaultSpeed = this.selectedDrone.cruiseSpeed;
                document.getElementById('default-speed').value = this.defaultSpeed;
            }
            
            this.updateActionButtons();
            this.updateMissionSummary();
            this.updateWarnings();
        }
    }

    // Waypoint Management
    addWaypoint(lat, lng, type = 'waypoint', altitude = null, speed = null, hoverTime = 0) {
        const waypoint = {
            id: Date.now() + Math.random(),
            lat: lat,
            lng: lng,
            altitude: altitude || this.defaultAltitude,
            speed: speed || this.defaultSpeed || this.selectedDrone?.cruiseSpeed || 15,
            hoverTime: hoverTime,
            type: type
        };

        this.waypoints.push(waypoint);
        this.addMarker(waypoint);
        this.updatePath();
        this.updateWaypointList();
        this.updateMissionSummary();
        this.updateActionButtons();
    }

    addMarker(waypoint) {
        const iconColor = waypoint.type === 'home' ? '#10b981' : 
                         waypoint.type === 'rtl' ? '#f59e0b' : '#3b82f6';
        
        const icon = L.divIcon({
            className: 'custom-waypoint-marker',
            html: `<div style="background-color: ${iconColor}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">
                    ${waypoint.type === 'home' ? 'H' : waypoint.type === 'rtl' ? 'R' : this.waypoints.indexOf(waypoint) + 1}
                   </div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const marker = L.marker([waypoint.lat, waypoint.lng], { icon: icon, draggable: true })
            .addTo(this.map)
            .bindPopup(this.createWaypointPopup(waypoint));

        marker.on('dragend', (e) => {
            waypoint.lat = e.target.getLatLng().lat;
            waypoint.lng = e.target.getLatLng().lng;
            this.updatePath();
            this.updateMissionSummary();
        });

        marker.on('click', () => {
            this.selectWaypoint(waypoint);
        });

        this.markers.push({ waypoint: waypoint, marker: marker });
    }

    createWaypointPopup(waypoint) {
        const index = this.waypoints.indexOf(waypoint);
        return `
            <div style="min-width: 150px;">
                <h4 style="margin: 0 0 8px 0;">${waypoint.type === 'home' ? 'Home Point' : 
                    waypoint.type === 'rtl' ? 'Return to Launch' : `Waypoint ${index + 1}`}</h4>
                <div style="font-size: 12px;">
                    <div><strong>Lat:</strong> ${waypoint.lat.toFixed(6)}</div>
                    <div><strong>Lon:</strong> ${waypoint.lng.toFixed(6)}</div>
                    <div><strong>Alt:</strong> ${waypoint.altitude} m</div>
                    <div><strong>Speed:</strong> ${waypoint.speed} m/s</div>
                </div>
            </div>
        `;
    }

    selectWaypoint(waypoint) {
        // Highlight in waypoint list
        const waypointElements = document.querySelectorAll('.waypoint-item');
        waypointElements.forEach(el => el.classList.remove('selected'));
        
        const index = this.waypoints.indexOf(waypoint);
        if (waypointElements[index]) {
            waypointElements[index].classList.add('selected');
        }
    }

    deleteWaypoint(waypoint) {
        const index = this.waypoints.indexOf(waypoint);
        if (index > -1) {
            this.waypoints.splice(index, 1);
            
            // Remove marker
            const markerObj = this.markers.find(m => m.waypoint === waypoint);
            if (markerObj) {
                this.map.removeLayer(markerObj.marker);
                this.markers = this.markers.filter(m => m !== markerObj);
            }
            
            // Update markers with new numbers
            this.updateMarkers();
            this.updatePath();
            this.updateWaypointList();
            this.updateMissionSummary();
            this.updateActionButtons();
        }
    }

    updateMarkers() {
        this.markers.forEach((markerObj, index) => {
            const waypoint = markerObj.waypoint;
            const iconColor = waypoint.type === 'home' ? '#10b981' : 
                             waypoint.type === 'rtl' ? '#f59e0b' : '#3b82f6';
            
            const icon = L.divIcon({
                className: 'custom-waypoint-marker',
                html: `<div style="background-color: ${iconColor}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">
                        ${waypoint.type === 'home' ? 'H' : waypoint.type === 'rtl' ? 'R' : index + 1}
                       </div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            
            markerObj.marker.setIcon(icon);
            markerObj.marker.setPopupContent(this.createWaypointPopup(waypoint));
        });
    }

    updateWaypointList() {
        const list = document.getElementById('waypoint-list');
        
        if (this.waypoints.length === 0) {
            list.innerHTML = '<div class="empty-waypoints"><p>Click on the map to add waypoints</p></div>';
            return;
        }

        list.innerHTML = this.waypoints.map((wp, index) => `
            <div class="waypoint-item ${wp.type === 'home' ? 'home-point' : wp.type === 'rtl' ? 'rtl-point' : ''}" data-index="${index}">
                <div class="waypoint-header">
                    <div>
                        <span class="waypoint-number">
                            ${wp.type === 'home' ? 'Home Point' : wp.type === 'rtl' ? 'RTL' : `Waypoint ${index + 1}`}
                        </span>
                        ${wp.type === 'waypoint' ? `<span class="waypoint-type">${wp.type}</span>` : ''}
                    </div>
                    <div class="waypoint-actions">
                        <button onclick="missionPlanner.deleteWaypoint(missionPlanner.waypoints[${index}])" class="delete">Delete</button>
                    </div>
                </div>
                <div class="waypoint-details">
                    <div class="waypoint-detail">
                        <span class="detail-label">Altitude (m)</span>
                        <input type="number" value="${wp.altitude}" 
                            onchange="missionPlanner.updateWaypointProperty(${index}, 'altitude', this.value)" 
                            step="1" min="0">
                    </div>
                    <div class="waypoint-detail">
                        <span class="detail-label">Speed (m/s)</span>
                        <input type="number" value="${wp.speed}" 
                            onchange="missionPlanner.updateWaypointProperty(${index}, 'speed', this.value)" 
                            step="0.1" min="0">
                    </div>
                    <div class="waypoint-detail">
                        <span class="detail-label">Lat</span>
                        <span class="detail-value">${wp.lat.toFixed(6)}</span>
                    </div>
                    <div class="waypoint-detail">
                        <span class="detail-label">Lon</span>
                        <span class="detail-value">${wp.lng.toFixed(6)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateWaypointProperty(index, property, value) {
        if (this.waypoints[index]) {
            this.waypoints[index][property] = parseFloat(value);
            this.updateMissionSummary();
            this.drawElevationProfile();
        }
    }

    // Path Management
    updatePath() {
        // Remove existing paths
        if (this.pathPolyline) {
            this.map.removeLayer(this.pathPolyline);
        }
        if (this.smoothPathPolyline) {
            this.map.removeLayer(this.smoothPathPolyline);
        }

        if (this.waypoints.length < 2) return;

        // Draw straight path
        const pathCoords = this.waypoints.map(wp => [wp.lat, wp.lng]);
        this.pathPolyline = L.polyline(pathCoords, {
            color: '#3b82f6',
            weight: 2,
            opacity: 0.4,
            dashArray: '5, 10'
        }).addTo(this.map);

        // Draw smooth path
        const smoothPath = this.generateSmoothPath();
        this.smoothPathPolyline = L.polyline(smoothPath, {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8
        }).addTo(this.map);

        this.drawElevationProfile();
    }

    generateSmoothPath() {
        if (this.waypoints.length < 3) {
            return this.waypoints.map(wp => [wp.lat, wp.lng]);
        }

        // Catmull-Rom spline interpolation
        const points = this.waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }));
        const smoothPoints = [];
        const segmentsPerPoint = 20;

        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];

            for (let t = 0; t < segmentsPerPoint; t++) {
                const tNorm = t / segmentsPerPoint;
                const lat = this.catmullRom(p0.lat, p1.lat, p2.lat, p3.lat, tNorm);
                const lng = this.catmullRom(p0.lng, p1.lng, p2.lng, p3.lng, tNorm);
                smoothPoints.push([lat, lng]);
            }
        }

        // Add last point
        const lastPoint = points[points.length - 1];
        smoothPoints.push([lastPoint.lat, lastPoint.lng]);

        return smoothPoints;
    }

    catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        
        return 0.5 * (
            (2 * p1) +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3
        );
    }

    // Distance Calculation
    calculateDistance(lat1, lng1, lat2, lng2) {
        // Haversine formula
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    getTotalDistance() {
        if (this.waypoints.length < 2) return 0;

        let totalDistance = 0;
        for (let i = 0; i < this.waypoints.length - 1; i++) {
            const wp1 = this.waypoints[i];
            const wp2 = this.waypoints[i + 1];
            totalDistance += this.calculateDistance(wp1.lat, wp1.lng, wp2.lat, wp2.lng);
        }

        return totalDistance;
    }

    // Mission Summary Calculations
    updateMissionSummary() {
        const totalDistance = this.getTotalDistance();
        
        // Update distance
        document.getElementById('summary-distance').textContent = 
            `${(totalDistance / 1000).toFixed(2)} km`;

        if (!this.selectedDrone || this.waypoints.length < 2) {
            document.getElementById('summary-time').textContent = '0.0 min';
            document.getElementById('summary-battery').textContent = '0%';
            document.getElementById('summary-battery-available').textContent = 'N/A';
            document.getElementById('summary-status').textContent = 
                !this.selectedDrone ? 'No drone selected' : 'No waypoints';
            this.updateAnalysis();
            return;
        }

        // Calculate flight time
        const avgSpeed = this.defaultSpeed || this.selectedDrone.cruiseSpeed;
        const windFactor = 1 + (this.windSpeed / avgSpeed) * 0.3; // Wind resistance factor
        const adjustedSpeed = avgSpeed / windFactor;
        const flightTime = (totalDistance / adjustedSpeed) / 60; // in minutes

        // Add hover time
        const totalHoverTime = this.waypoints.reduce((sum, wp) => sum + (wp.hoverTime || 0), 0) / 60;
        const totalFlightTime = flightTime + totalHoverTime;

        document.getElementById('summary-time').textContent = `${totalFlightTime.toFixed(1)} min`;

        // Calculate battery usage
        let batteryRequired = 0;
        if (this.selectedDrone.maxFlightTime) {
            batteryRequired = (totalFlightTime / this.selectedDrone.maxFlightTime) * 100;
        } else if (this.selectedDrone.batteryCapacity && this.selectedDrone.hoverCurrent) {
            const maxFlightTime = (this.selectedDrone.batteryCapacity / 1000) / 
                                  this.selectedDrone.hoverCurrent * 60 * 0.8;
            batteryRequired = (totalFlightTime / maxFlightTime) * 100;
        }

        // Apply safety reserve
        const batteryWithReserve = batteryRequired * (1 + this.safetyReserve / 100);
        
        document.getElementById('summary-battery').textContent = 
            `${batteryRequired.toFixed(1)}%`;
        document.getElementById('summary-battery-available').textContent = 
            `${(100 - batteryWithReserve).toFixed(1)}%`;

        // Mission status
        const statusElement = document.getElementById('summary-status');
        if (batteryWithReserve > 100) {
            statusElement.textContent = 'CANNOT COMPLETE';
            statusElement.style.color = '#ef4444';
        } else if (batteryWithReserve > 80) {
            statusElement.textContent = 'RISKY';
            statusElement.style.color = '#f59e0b';
        } else {
            statusElement.textContent = 'FEASIBLE';
            statusElement.style.color = '#10b981';
        }

        this.updateAnalysis();
        this.updateWarnings();
    }

    updateAnalysis() {
        document.getElementById('analysis-waypoints').textContent = this.waypoints.length;
        document.getElementById('analysis-segments').textContent = 
            Math.max(0, this.waypoints.length - 1);

        if (this.waypoints.length > 0) {
            const avgAltitude = this.waypoints.reduce((sum, wp) => sum + wp.altitude, 0) / 
                               this.waypoints.length;
            document.getElementById('analysis-altitude').textContent = 
                `${avgAltitude.toFixed(0)} m`;

            // Calculate max distance from home
            if (this.homePoint) {
                let maxDist = 0;
                this.waypoints.forEach(wp => {
                    const dist = this.calculateDistance(
                        this.homePoint.lat, this.homePoint.lng, wp.lat, wp.lng
                    );
                    maxDist = Math.max(maxDist, dist);
                });
                document.getElementById('analysis-max-distance').textContent = 
                    `${maxDist.toFixed(0)} m`;
            } else {
                document.getElementById('analysis-max-distance').textContent = 'N/A';
            }
        } else {
            document.getElementById('analysis-altitude').textContent = '0 m';
            document.getElementById('analysis-max-distance').textContent = '0 m';
        }
    }

    drawElevationProfile() {
        const canvas = document.getElementById('elevation-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = canvas.offsetHeight;

        // Clear canvas
        ctx.fillStyle = '#252525';
        ctx.fillRect(0, 0, width, height);

        if (this.waypoints.length < 2) {
            ctx.fillStyle = '#707070';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No waypoints to display', width / 2, height / 2);
            return;
        }

        // Find altitude range
        const altitudes = this.waypoints.map(wp => wp.altitude);
        const minAlt = Math.min(...altitudes);
        const maxAlt = Math.max(...altitudes);
        const altRange = maxAlt - minAlt || 10;

        // Draw grid
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = (height - 20) * (i / 5) + 10;
            ctx.beginPath();
            ctx.moveTo(40, y);
            ctx.lineTo(width - 10, y);
            ctx.stroke();
        }

        // Draw profile
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();

        this.waypoints.forEach((wp, i) => {
            const x = 40 + (width - 50) * (i / (this.waypoints.length - 1));
            const y = height - 20 - ((wp.altitude - minAlt) / altRange) * (height - 30);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Draw points
        ctx.fillStyle = '#3b82f6';
        this.waypoints.forEach((wp, i) => {
            const x = 40 + (width - 50) * (i / (this.waypoints.length - 1));
            const y = height - 20 - ((wp.altitude - minAlt) / altRange) * (height - 30);
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Draw labels
        ctx.fillStyle = '#a8a8a8';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        
        for (let i = 0; i <= 5; i++) {
            const alt = minAlt + (altRange * (5 - i) / 5);
            const y = (height - 20) * (i / 5) + 10;
            ctx.fillText(`${alt.toFixed(0)}m`, 35, y + 4);
        }
    }

    updateWarnings() {
        const warningsContainer = document.getElementById('mission-warnings');
        const warnings = [];

        if (!this.selectedDrone) {
            warnings.push({
                type: 'info',
                message: 'Select a drone to start planning'
            });
        } else if (this.waypoints.length === 0) {
            warnings.push({
                type: 'info',
                message: 'Add waypoints to create a mission'
            });
        } else {
            // Check battery
            const totalDistance = this.getTotalDistance();
            const avgSpeed = this.defaultSpeed || this.selectedDrone.cruiseSpeed;
            const windFactor = 1 + (this.windSpeed / avgSpeed) * 0.3;
            const adjustedSpeed = avgSpeed / windFactor;
            const flightTime = (totalDistance / adjustedSpeed) / 60;
            
            let batteryRequired = 0;
            if (this.selectedDrone.maxFlightTime) {
                batteryRequired = (flightTime / this.selectedDrone.maxFlightTime) * 100;
            }

            const batteryWithReserve = batteryRequired * (1 + this.safetyReserve / 100);

            if (batteryWithReserve > 100) {
                warnings.push({
                    type: 'error',
                    message: 'Mission exceeds drone battery capacity'
                });
            } else if (batteryWithReserve > 80) {
                warnings.push({
                    type: 'warning',
                    message: 'Low battery margin - consider adding charging stop'
                });
            } else {
                warnings.push({
                    type: 'success',
                    message: 'Mission is feasible with current parameters'
                });
            }

            // Check altitude
            const maxAltitude = Math.max(...this.waypoints.map(wp => wp.altitude));
            if (this.selectedDrone.maxAltitude && maxAltitude > this.selectedDrone.maxAltitude) {
                warnings.push({
                    type: 'warning',
                    message: `Waypoint exceeds max altitude (${this.selectedDrone.maxAltitude}m)`
                });
            }

            // Check wind
            if (this.windSpeed > (this.selectedDrone.windResistance || 10)) {
                warnings.push({
                    type: 'warning',
                    message: 'Wind speed exceeds drone capabilities'
                });
            }

            // Check home point
            if (!this.homePoint) {
                warnings.push({
                    type: 'info',
                    message: 'No home point set - consider setting one for safety'
                });
            }
        }

        warningsContainer.innerHTML = warnings.map(w => `
            <div class="warning-item ${w.type}">
                <span class="warning-icon">${w.type === 'error' ? 'X' : w.type === 'warning' ? '!' : w.type === 'success' ? 'OK' : 'i'}</span>
                <span>${w.message}</span>
            </div>
        `).join('');
    }

    updateActionButtons() {
        const hasWaypoints = this.waypoints.length > 0;
        const hasDrone = this.selectedDrone !== null;
        
        document.getElementById('set-home-btn').disabled = !hasWaypoints;
        document.getElementById('add-rtl-btn').disabled = !hasWaypoints || !this.homePoint;
        document.getElementById('optimize-path-btn').disabled = !hasWaypoints || this.waypoints.length < 3;
        document.getElementById('export-mission-btn').disabled = !hasWaypoints || !hasDrone;
        document.getElementById('save-mission-btn').disabled = !hasWaypoints || !hasDrone;
    }

    // Save/Load Missions
    saveMission() {
        if (this.waypoints.length === 0 || !this.selectedDrone) return;

        const missionName = prompt('Enter a name for this mission:', `Mission ${new Date().toLocaleDateString()}`);
        if (!missionName) return;

        const mission = {
            id: Date.now().toString(),
            name: missionName,
            createdAt: new Date().toISOString(),
            drone: {
                id: this.selectedDrone.id,
                name: this.selectedDrone.name,
                type: this.selectedDrone.type
            },
            parameters: {
                defaultAltitude: this.defaultAltitude,
                defaultSpeed: this.defaultSpeed,
                safetyReserve: this.safetyReserve,
                windSpeed: this.windSpeed
            },
            waypoints: this.waypoints.map((wp, i) => ({
                index: i,
                latitude: wp.lat,
                longitude: wp.lng,
                altitude: wp.altitude,
                speed: wp.speed,
                hoverTime: wp.hoverTime,
                type: wp.type
            })),
            summary: {
                totalDistance: (this.getTotalDistance() / 1000).toFixed(2) + ' km',
                waypointCount: this.waypoints.length
            }
        };

        // Save to localStorage
        const missions = JSON.parse(localStorage.getItem('uav_missions') || '[]');
        missions.push(mission);
        localStorage.setItem('uav_missions', JSON.stringify(missions));

        alert(`Mission "${missionName}" saved successfully!`);
    }

    showSavedMissions() {
        const missions = JSON.parse(localStorage.getItem('uav_missions') || '[]');
        const section = document.getElementById('saved-missions-section');
        const list = document.getElementById('saved-missions-list');

        if (missions.length === 0) {
            alert('No saved missions found');
            return;
        }

        list.innerHTML = missions.map(mission => `
            <div class="saved-mission-item">
                <div class="saved-mission-header">
                    <div>
                        <div class="saved-mission-name">${mission.name}</div>
                        <div class="saved-mission-date">${new Date(mission.createdAt).toLocaleString()}</div>
                    </div>
                </div>
                <div class="saved-mission-info">
                    <span>Drone: ${mission.drone.name}</span>
                    <span>Waypoints: ${mission.summary.waypointCount}</span>
                    <span>Distance: ${mission.summary.totalDistance}</span>
                </div>
                <div class="saved-mission-actions">
                    <button onclick="missionPlanner.loadSavedMission('${mission.id}')">Load</button>
                    <button class="delete" onclick="missionPlanner.deleteSavedMission('${mission.id}')">Delete</button>
                </div>
            </div>
        `).join('');

        section.style.display = 'block';
    }

    hideSavedMissions() {
        document.getElementById('saved-missions-section').style.display = 'none';
    }

    loadSavedMission(missionId) {
        const missions = JSON.parse(localStorage.getItem('uav_missions') || '[]');
        const mission = missions.find(m => m.id === missionId);

        if (!mission) return;

        // Clear current mission
        this.clearMission();

        // Load drone if available
        if (mission.drone && mission.drone.id) {
            const droneSelect = document.getElementById('mission-drone-select');
            droneSelect.value = mission.drone.id;
            this.selectDrone(mission.drone.id);
        }

        // Load parameters
        if (mission.parameters) {
            document.getElementById('default-altitude').value = mission.parameters.defaultAltitude || 50;
            document.getElementById('default-speed').value = mission.parameters.defaultSpeed || 0;
            document.getElementById('safety-reserve').value = mission.parameters.safetyReserve || 20;
            document.getElementById('wind-speed').value = mission.parameters.windSpeed || 0;
            
            this.defaultAltitude = mission.parameters.defaultAltitude || 50;
            this.defaultSpeed = mission.parameters.defaultSpeed || 0;
            this.safetyReserve = mission.parameters.safetyReserve || 20;
            this.windSpeed = mission.parameters.windSpeed || 0;
        }

        // Load waypoints
        if (mission.waypoints && Array.isArray(mission.waypoints)) {
            mission.waypoints.forEach(wp => {
                this.addWaypoint(
                    wp.latitude,
                    wp.longitude,
                    wp.type || 'waypoint',
                    wp.altitude,
                    wp.speed,
                    wp.hoverTime || 0
                );
            });

            // Set home point if exists
            const homeWp = mission.waypoints.find(wp => wp.type === 'home');
            if (homeWp) {
                this.homePoint = { lat: homeWp.latitude, lng: homeWp.longitude };
            }

            // Fit map to waypoints
            const bounds = L.latLngBounds(this.waypoints.map(wp => [wp.lat, wp.lng]));
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }

        this.hideSavedMissions();
        alert(`Mission "${mission.name}" loaded successfully!`);
    }

    deleteSavedMission(missionId) {
        if (!confirm('Are you sure you want to delete this mission?')) return;

        let missions = JSON.parse(localStorage.getItem('uav_missions') || '[]');
        missions = missions.filter(m => m.id !== missionId);
        localStorage.setItem('uav_missions', JSON.stringify(missions));

        this.showSavedMissions();
    }

    // Mission Actions
    setHomePoint() {
        if (this.waypoints.length === 0) return;

        if (this.homePoint) {
            // Update existing home point
            this.homePoint.lat = this.waypoints[0].lat;
            this.homePoint.lng = this.waypoints[0].lng;
        } else {
            // Set first waypoint as home
            this.homePoint = {
                lat: this.waypoints[0].lat,
                lng: this.waypoints[0].lng
            };
        }

        this.waypoints[0].type = 'home';
        this.updateMarkers();
        this.updateWaypointList();
        this.updateActionButtons();
    }

    addReturnToLaunch() {
        if (!this.homePoint) return;

        // Check if last waypoint is already RTL
        if (this.waypoints[this.waypoints.length - 1].type === 'rtl') {
            return;
        }

        this.addWaypoint(this.homePoint.lat, this.homePoint.lng, 'rtl', this.defaultAltitude);
    }

    optimizePath() {
        if (this.waypoints.length < 3) return;

        // Traveling Salesman Problem - Nearest Neighbor heuristic
        const homeIndex = this.waypoints.findIndex(wp => wp.type === 'home');
        const rtlIndex = this.waypoints.findIndex(wp => wp.type === 'rtl');
        
        const fixedPoints = [];
        if (homeIndex !== -1) fixedPoints.push(homeIndex);
        if (rtlIndex !== -1) fixedPoints.push(rtlIndex);

        // Get waypoints that can be reordered
        const optimizable = this.waypoints.filter((wp, i) => 
            wp.type === 'waypoint' && !fixedPoints.includes(i)
        );

        if (optimizable.length < 2) return;

        // Nearest neighbor algorithm
        const startPoint = homeIndex !== -1 ? this.waypoints[homeIndex] : this.waypoints[0];
        const optimized = [startPoint];
        const remaining = [...optimizable];

        while (remaining.length > 0) {
            const current = optimized[optimized.length - 1];
            let nearestIndex = 0;
            let nearestDist = Infinity;

            remaining.forEach((wp, i) => {
                const dist = this.calculateDistance(current.lat, current.lng, wp.lat, wp.lng);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIndex = i;
                }
            });

            optimized.push(remaining[nearestIndex]);
            remaining.splice(nearestIndex, 1);
        }

        // Add RTL at the end if it exists
        if (rtlIndex !== -1) {
            optimized.push(this.waypoints[rtlIndex]);
        }

        // Clear markers
        this.markers.forEach(m => this.map.removeLayer(m.marker));
        this.markers = [];

        // Update waypoints
        this.waypoints = optimized;

        // Recreate markers
        this.waypoints.forEach(wp => this.addMarker(wp));
        this.updatePath();
        this.updateWaypointList();
        this.updateMissionSummary();
    }

    clearMission() {
        if (this.waypoints.length === 0) return;

        if (confirm('Are you sure you want to clear all waypoints?')) {
            this.markers.forEach(m => this.map.removeLayer(m.marker));
            this.markers = [];
            this.waypoints = [];
            this.homePoint = null;
            
            if (this.pathPolyline) {
                this.map.removeLayer(this.pathPolyline);
                this.pathPolyline = null;
            }
            if (this.smoothPathPolyline) {
                this.map.removeLayer(this.smoothPathPolyline);
                this.smoothPathPolyline = null;
            }

            this.updateWaypointList();
            this.updateMissionSummary();
            this.updateActionButtons();
            this.drawElevationProfile();
        }
    }

    // Import/Export
    exportMission() {
        if (this.waypoints.length === 0 || !this.selectedDrone) return;

        const mission = {
            metadata: {
                exportDate: new Date().toISOString(),
                version: '1.0',
                application: 'UAV Flight Planner'
            },
            drone: {
                id: this.selectedDrone.id,
                name: this.selectedDrone.name,
                type: this.selectedDrone.type
            },
            parameters: {
                defaultAltitude: this.defaultAltitude,
                defaultSpeed: this.defaultSpeed,
                safetyReserve: this.safetyReserve,
                windSpeed: this.windSpeed
            },
            waypoints: this.waypoints.map((wp, i) => ({
                index: i,
                latitude: wp.lat,
                longitude: wp.lng,
                altitude: wp.altitude,
                speed: wp.speed,
                hoverTime: wp.hoverTime,
                type: wp.type
            })),
            summary: {
                totalDistance: (this.getTotalDistance() / 1000).toFixed(2) + ' km',
                waypointCount: this.waypoints.length,
                estimatedFlightTime: document.getElementById('summary-time').textContent,
                batteryRequired: document.getElementById('summary-battery').textContent
            }
        };

        const dataStr = JSON.stringify(mission, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mission_${this.selectedDrone.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    importMission(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const mission = JSON.parse(e.target.result);
                
                // Clear current mission
                this.clearMission();

                // Load drone if available
                if (mission.drone && mission.drone.id) {
                    const droneSelect = document.getElementById('mission-drone-select');
                    droneSelect.value = mission.drone.id;
                    this.selectDrone(mission.drone.id);
                }

                // Load parameters
                if (mission.parameters) {
                    document.getElementById('default-altitude').value = mission.parameters.defaultAltitude || 50;
                    document.getElementById('default-speed').value = mission.parameters.defaultSpeed || 0;
                    document.getElementById('safety-reserve').value = mission.parameters.safetyReserve || 20;
                    document.getElementById('wind-speed').value = mission.parameters.windSpeed || 0;
                    
                    this.defaultAltitude = mission.parameters.defaultAltitude || 50;
                    this.defaultSpeed = mission.parameters.defaultSpeed || 0;
                    this.safetyReserve = mission.parameters.safetyReserve || 20;
                    this.windSpeed = mission.parameters.windSpeed || 0;
                }

                // Load waypoints
                if (mission.waypoints && Array.isArray(mission.waypoints)) {
                    mission.waypoints.forEach(wp => {
                        this.addWaypoint(
                            wp.latitude,
                            wp.longitude,
                            wp.type || 'waypoint',
                            wp.altitude,
                            wp.speed,
                            wp.hoverTime || 0
                        );
                    });

                    // Set home point if exists
                    const homeWp = mission.waypoints.find(wp => wp.type === 'home');
                    if (homeWp) {
                        this.homePoint = { lat: homeWp.latitude, lng: homeWp.longitude };
                    }

                    // Fit map to waypoints
                    const bounds = L.latLngBounds(this.waypoints.map(wp => [wp.lat, wp.lng]));
                    this.map.fitBounds(bounds, { padding: [50, 50] });
                }

            } catch (error) {
                alert('Error importing mission file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    // Map Controls
    locateUser() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    this.map.setView([latitude, longitude], 15);
                },
                (error) => {
                    alert('Could not get your location: ' + error.message);
                }
            );
        } else {
            alert('Geolocation is not supported by your browser');
        }
    }

    searchLocation(query) {
        if (!query) return;

        // Using OpenStreetMap Nominatim API for geocoding
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    const result = data[0];
                    this.map.setView([parseFloat(result.lat), parseFloat(result.lon)], 13);
                } else {
                    alert('Location not found');
                }
            })
            .catch(error => {
                console.error('Error searching location:', error);
                alert('Error searching location');
            });
    }
}

// Initialize mission planner when page loads
let missionPlanner;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.droneManager) {
            missionPlanner = new MissionPlanner(window.droneManager);
            window.missionPlanner = missionPlanner;
        }
    });
} else {
    if (window.droneManager) {
        missionPlanner = new MissionPlanner(window.droneManager);
        window.missionPlanner = missionPlanner;
    }
}
