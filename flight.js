// Flight View - Live Drone Feed and Telemetry System
// search_query: flight_js_airbus_horizon_fix

class FlightManager {
    constructor(droneManager, missionPlanner) {
        this.droneManager = droneManager;
        this.missionPlanner = missionPlanner;
        this.selectedDrone = null;
        this.selectedMission = null;
        this.isConnected = false;
        this.telemetryInterval = null;
        this.flightStartTime = null;
        
        // Telemetry data
        this.telemetry = {
            lat: 0,
            lng: 0,
            altitude: 0,
            speed: 0,
            heading: 0,
            pitch: 0,
            roll: 0,
            vspeed: 0,
            battery: 100,
            voltage: 0,
            current: 0,
            distanceHome: 0,
            satellites: 0,
            hdop: 0,
            rcSignal: 0
        };
        
        // Mini map
        this.miniMap = null;
        this.droneMarker = null;
        this.arcMode = false;
        this.miniMapExpanded = false;
        
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.setupEventListeners();
        this.loadDroneList();
        this.loadMissionList();
        this.initMiniMap();
        this.initArtificialHorizon();
        this.setupDraggableMap();
        this.startTelemetrySimulation();
        this.setupViewObserver();
    }
    
    setupViewObserver() {
        // Listen for view changes to resize mini map
        const flightView = document.getElementById('flight-view');
        if (!flightView) return;
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const isActive = flightView.classList.contains('active');
                    if (isActive && this.miniMap) {
                        setTimeout(() => {
                            this.miniMap.invalidateSize();
                        }, 100);
                    }
                }
            });
        });
        
        observer.observe(flightView, { attributes: true });
    }

    // Event Listeners
    setupEventListeners() {
        // Drone selection
        document.getElementById('flight-drone-select')?.addEventListener('change', (e) => {
            this.selectDrone(e.target.value);
        });

        // Mission selection
        document.getElementById('flight-mission-select')?.addEventListener('change', (e) => {
            this.selectMission(e.target.value);
        });

        // Flight controls
        document.getElementById('arm-btn')?.addEventListener('click', () => this.armDrone());
        document.getElementById('takeoff-btn')?.addEventListener('click', () => this.takeoff());
        document.getElementById('land-btn')?.addEventListener('click', () => this.land());
        document.getElementById('return-btn')?.addEventListener('click', () => this.returnToHome());
        document.getElementById('abort-btn')?.addEventListener('click', () => this.emergencyAbort());

        // Camera controls
        document.getElementById('camera-switch-btn')?.addEventListener('click', () => this.switchCamera());
        document.getElementById('camera-record-btn')?.addEventListener('click', () => this.toggleRecording());

        // Mini map controls
        document.getElementById('toggle-arc-mode')?.addEventListener('click', () => this.toggleArcMode());
        document.getElementById('expand-mini-map')?.addEventListener('click', () => this.expandMiniMap());
        document.getElementById('minimize-mini-map')?.addEventListener('click', () => this.minimizeMiniMap());
    }

    loadDroneList() {
        const select = document.getElementById('flight-drone-select');
        if (!select) return;
        
        const drones = this.droneManager.getAllDrones();
        select.innerHTML = '<option value="">Select drone</option>';
        
        drones.forEach(drone => {
            const option = document.createElement('option');
            option.value = drone.id;
            option.textContent = `${drone.name} (${drone.type})`;
            select.appendChild(option);
        });
    }

    loadMissionList() {
        const select = document.getElementById('flight-mission-select');
        if (!select) return;
        
        const missions = JSON.parse(localStorage.getItem('uav_missions') || '[]');
        select.innerHTML = '<option value="">No mission loaded</option>';
        
        missions.forEach(mission => {
            const option = document.createElement('option');
            option.value = mission.id;
            option.textContent = mission.name;
            select.appendChild(option);
        });
    }

    selectDrone(droneId) {
        if (!droneId) {
            this.selectedDrone = null;
            return;
        }

        this.selectedDrone = this.droneManager.getDroneById(droneId);
        if (this.selectedDrone) {
            this.telemetry.voltage = this.selectedDrone.batteryVoltage || 22.2;
            this.updateTelemetryDisplay();
        }
    }

    selectMission(missionId) {
        if (!missionId) {
            this.selectedMission = null;
            return;
        }

        const missions = JSON.parse(localStorage.getItem('uav_missions') || '[]');
        this.selectedMission = missions.find(m => m.id === missionId);
        
        if (this.selectedMission && this.miniMap) {
            this.loadMissionOnMiniMap();
        }
    }

    // Mini Map
    initMiniMap() {
        const mapElement = document.getElementById('mini-map');
        if (!mapElement) return;

        this.miniMap = L.map('mini-map', {
            center: [37.7749, -122.4194],
            zoom: 14,
            zoomControl: false,
            attributionControl: false
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.miniMap);

        // Add drone marker
        const droneIcon = L.divIcon({
            className: 'drone-marker',
            html: '<div style="width: 16px; height: 16px; background-color: #3b82f6; border-radius: 50%; border: 2px solid white;"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        this.droneMarker = L.marker([37.7749, -122.4194], { icon: droneIcon }).addTo(this.miniMap);

        setTimeout(() => {
            this.miniMap.invalidateSize();
        }, 300);
    }

    loadMissionOnMiniMap() {
        if (!this.miniMap || !this.selectedMission) return;

        // Clear existing paths
        this.miniMap.eachLayer((layer) => {
            if (layer instanceof L.Polyline || (layer instanceof L.Marker && layer !== this.droneMarker)) {
                this.miniMap.removeLayer(layer);
            }
        });

        // Draw mission path
        const waypoints = this.selectedMission.waypoints;
        if (waypoints && waypoints.length > 0) {
            const pathCoords = waypoints.map(wp => [wp.latitude, wp.longitude]);
            L.polyline(pathCoords, {
                color: '#10b981',
                weight: 2,
                opacity: 0.8
            }).addTo(this.miniMap);

            // Fit bounds
            this.miniMap.fitBounds(pathCoords);
        }
    }

    toggleArcMode() {
        this.arcMode = !this.arcMode;
        const arcOverlay = document.getElementById('arc-overlay');
        const btn = document.getElementById('toggle-arc-mode');
        
        if (this.arcMode) {
            arcOverlay.style.display = 'block';
            btn.classList.add('active');
            this.drawArcOverlay();
        } else {
            arcOverlay.style.display = 'none';
            btn.classList.remove('active');
        }
    }

    drawArcOverlay() {
        const canvas = document.getElementById('arc-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const centerX = canvas.width / 2;
        const centerY = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw arc rings
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
        ctx.lineWidth = 1;
        
        const rings = 4;
        const maxRadius = canvas.height;
        
        for (let i = 1; i <= rings; i++) {
            const radius = (maxRadius / rings) * i;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, Math.PI, 0, false);
            ctx.stroke();
        }

        // Draw radial lines
        for (let angle = 180; angle <= 360; angle += 30) {
            const rad = (angle * Math.PI) / 180;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + Math.cos(rad) * maxRadius,
                centerY + Math.sin(rad) * maxRadius
            );
            ctx.stroke();
        }

        // Draw heading indicator
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX, centerY - maxRadius * 0.8);
        ctx.stroke();

        // Draw range circles labels
        ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.font = '10px monospace';
        for (let i = 1; i <= rings; i++) {
            const distance = (1 / rings * i).toFixed(1);
            ctx.fillText(`${distance}km`, centerX + 5, centerY - (maxRadius / rings) * i);
        }
    }

    expandMiniMap() {
        const window = document.getElementById('mini-map-window');
        window.classList.toggle('expanded');
        this.miniMapExpanded = !this.miniMapExpanded;
        
        setTimeout(() => {
            if (this.miniMap) {
                this.miniMap.invalidateSize();
                if (this.arcMode) {
                    this.drawArcOverlay();
                }
            }
        }, 300);
    }

    minimizeMiniMap() {
        const window = document.getElementById('mini-map-window');
        window.classList.toggle('minimized');
    }

    // Draggable Mini Map
    setupDraggableMap() {
        const mapWindow = document.getElementById('mini-map-window');
        const header = document.getElementById('mini-map-header');
        
        if (!mapWindow || !header) return;

        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;

            if (e.target === header || header.contains(e.target)) {
                isDragging = true;
            }
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                xOffset = currentX;
                yOffset = currentY;

                setTranslate(currentX, currentY, mapWindow);
            }
        }

        function dragEnd(e) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        }

        function setTranslate(xPos, yPos, el) {
            el.style.transform = `translate(${xPos}px, ${yPos}px)`;
        }
    }

    // Artificial Horizon - Airbus A320 Style (Fixed & Robust)
    initArtificialHorizon() {
        const canvas = document.getElementById('artificial-horizon');
        if (!canvas) return;

        this.horizonCanvas = canvas;
        this.horizonCtx = canvas.getContext('2d');
        
        // Start the animation loop
        this.updateArtificialHorizon();
    }

    updateArtificialHorizon() {
        if (!this.horizonCanvas || !this.horizonCtx) return;

        const canvas = this.horizonCanvas;
        const ctx = this.horizonCtx;
        
        // Ensure canvas size matches display size every frame
        // This fixes the "grey screen" issue when switching tabs
        if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }

        // If canvas is still 0 (hidden), just request next frame and return
        if (canvas.width === 0 || canvas.height === 0) {
            requestAnimationFrame(() => this.updateArtificialHorizon());
            return;
        }

        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Define viewport radius (minus padding)
        const radius = Math.min(width, height) / 2 - 20;

        const pitch = this.telemetry.pitch || 0;
        const roll = this.telemetry.roll || 0;

        // --- Render Cycle ---

        // 1. Clear with black (for outside the circular mask)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // 2. Set Circular Clipping Region
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.clip();

        // 3. Sky and Ground (Using Transform Method for Robustness)
        // This ensures colors are visible regardless of pitch magnitude
        ctx.save();
        
        // Translate to Center
        ctx.translate(centerX, centerY);
        
        // Rotate for Bank (Roll) - Negative roll to rotate horizon opposite to bank
        ctx.rotate((-roll * Math.PI) / 180);
        
        // Translate for Pitch (Scale: 1 degree = ~4-5 pixels)
        const pitchScale = radius / 30; // 30 degrees from center to edge
        const pitchPixelOffset = pitch * pitchScale;
        ctx.translate(0, pitchPixelOffset);

        // Draw Sky (Massive Rectangle above 0) - Airbus Blue
        ctx.fillStyle = '#3FB0F0'; 
        // Draw from -5000 up to 0 (horizon line)
        ctx.fillRect(-2000, -5000, 4000, 5000);

        // Draw Ground (Massive Rectangle below 0) - Airbus/Boeing Brown
        ctx.fillStyle = '#8B5A2B';
        // Draw from 0 down to 5000
        ctx.fillRect(-2000, 0, 4000, 5000);

        // Draw Horizon Line
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-2000, 0);
        ctx.lineTo(2000, 0);
        ctx.stroke();

        // Draw Pitch Ladder (Fixed to the horizon world)
        ctx.strokeStyle = '#FFFFFF';
        ctx.fillStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw lines every 2.5 degrees, from -90 to +90
        // Optimization: Only draw what's roughly visible (-40 to +40 relative to pitch)
        const startPitch = Math.floor((pitch - 40) / 2.5) * 2.5;
        const endPitch = Math.ceil((pitch + 40) / 2.5) * 2.5;

        for (let p = -90; p <= 90; p += 2.5) {
            if (p === 0) continue; // Horizon line already drawn
            if (Math.abs(p - pitch) > 40) continue; // Skip if out of view

            const y = -p * pitchScale; // Negative because up is negative Y in canvas
            const isMajor = p % 10 === 0;
            const lineHalfWidth = isMajor ? 30 : 15;

            ctx.beginPath();
            ctx.moveTo(-lineHalfWidth, y);
            ctx.lineTo(lineHalfWidth, y);
            ctx.stroke();

            if (isMajor) {
                ctx.fillText(Math.abs(p).toString(), -lineHalfWidth - 15, y);
                ctx.fillText(Math.abs(p).toString(), lineHalfWidth + 15, y);
            }
        }

        // Restore coordinate system (Back to screen coordinates, but still clipped)
        ctx.restore(); 

        // 4. Draw Bank Scale (Fixed to Screen)
        // Top Arc
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.stroke();

        // Bank Markers
        const bankAngles = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
        bankAngles.forEach(angle => {
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate((angle * Math.PI) / 180);
            
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -radius);
            ctx.lineTo(0, -radius + (angle % 30 === 0 ? 15 : 8));
            ctx.stroke();
            
            // Yellow Triangle at 0 (Sky Pointer)
            if (angle === 0) {
                ctx.fillStyle = '#FFFF00';
                ctx.beginPath();
                ctx.moveTo(0, -radius + 15);
                ctx.lineTo(-6, -radius + 25);
                ctx.lineTo(6, -radius + 25);
                ctx.fill();
            }
            ctx.restore();
        });

        // 5. Draw Roll Pointer (Moving Triangle)
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((roll * Math.PI) / 180);
        
        ctx.fillStyle = '#FFFF00'; // Yellow
        ctx.beginPath();
        // Points UP towards the Sky Pointer
        ctx.moveTo(0, -radius + 5); 
        ctx.lineTo(-8, -radius + 18);
        ctx.lineTo(8, -radius + 18);
        ctx.fill();
        ctx.restore();

        // End Clipping
        ctx.restore(); 

        // 6. Draw Fixed Aircraft Symbol (Black with Yellow Outline)
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#FFFF00'; // Yellow outline
        ctx.fillStyle = '#000000'; // Black fill
        
        // Center Dot
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Wings (Airbus Style - stylized)
        // Left Wing
        ctx.beginPath();
        ctx.moveTo(centerX - 80, centerY); 
        ctx.lineTo(centerX - 20, centerY);
        ctx.lineTo(centerX - 20, centerY + 10);
        ctx.stroke();

        // Right Wing
        ctx.beginPath();
        ctx.moveTo(centerX + 80, centerY);
        ctx.lineTo(centerX + 20, centerY);
        ctx.lineTo(centerX + 20, centerY + 10);
        ctx.stroke();

        // 7. Digital Readouts (HUD)
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#00FF00'; // Green text
        
        // Pitch
        ctx.fillText(`PIT: ${pitch.toFixed(1)}°`, centerX - 120, centerY + 150);
        // Roll
        ctx.fillText(`ROL: ${roll.toFixed(1)}°`, centerX + 120, centerY + 150);

        requestAnimationFrame(() => this.updateArtificialHorizon());
    }

    // Telemetry Simulation
    startTelemetrySimulation() {
        // Simulate telemetry data for demo purposes
        this.telemetryInterval = setInterval(() => {
            // Only jitter if connected, or simulate basic movement
            if (this.isConnected) {
                this.telemetry.pitch += (Math.random() - 0.5) * 0.5;
                this.telemetry.roll += (Math.random() - 0.5) * 0.5;
                this.telemetry.heading += (Math.random() - 0.5) * 0.2;
                
                // Clamp values
                this.telemetry.pitch = Math.max(-30, Math.min(30, this.telemetry.pitch));
                this.telemetry.roll = Math.max(-45, Math.min(45, this.telemetry.roll));
                this.telemetry.heading = (this.telemetry.heading + 360) % 360;
                
                this.updateTelemetryDisplay();
                this.updateInstruments();
            }
        }, 100);
    }

    updateTelemetryDisplay() {
        document.getElementById('telem-lat').textContent = this.telemetry.lat.toFixed(6);
        document.getElementById('telem-lng').textContent = this.telemetry.lng.toFixed(6);
        document.getElementById('telem-gspeed').textContent = `${this.telemetry.speed.toFixed(1)} m/s`;
        document.getElementById('telem-aspeed').textContent = `${this.telemetry.speed.toFixed(1)} m/s`;
        document.getElementById('telem-battery').textContent = `${this.telemetry.battery.toFixed(0)}%`;
        document.getElementById('telem-voltage').textContent = `${this.telemetry.voltage.toFixed(1)} V`;
        document.getElementById('telem-current').textContent = `${this.telemetry.current.toFixed(1)} A`;
        document.getElementById('telem-dist').textContent = `${this.telemetry.distanceHome.toFixed(0)} m`;
        document.getElementById('telem-sats').textContent = this.telemetry.satellites;
        document.getElementById('telem-hdop').textContent = this.telemetry.hdop.toFixed(1);
        document.getElementById('telem-rc').textContent = `${this.telemetry.rcSignal}%`;
        
        if (this.flightStartTime) {
            const elapsed = Math.floor((Date.now() - this.flightStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('telem-time').textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        // Update mini map heading
        document.getElementById('mini-map-heading').textContent = `${this.telemetry.heading.toFixed(0)}°`;
    }

    updateInstruments() {
        document.getElementById('flight-altitude').textContent = `${this.telemetry.altitude.toFixed(0)} m`;
        document.getElementById('flight-speed').textContent = `${this.telemetry.speed.toFixed(1)} m/s`;
        document.getElementById('flight-heading').textContent = `${this.telemetry.heading.toFixed(0)}°`;
        document.getElementById('flight-vspeed').textContent = `${this.telemetry.vspeed.toFixed(1)} m/s`;
    }

    // Flight Controls
    armDrone() {
        if (!this.selectedDrone) {
            alert('Please select a drone first');
            return;
        }

        this.isConnected = true;
        document.getElementById('flight-drone-status').textContent = 'Connected - Armed';
        document.getElementById('flight-drone-status').className = 'status-indicator connected';
        
        document.getElementById('arm-btn').disabled = true;
        document.getElementById('takeoff-btn').disabled = false;
        
        this.telemetry.satellites = 12;
        this.telemetry.hdop = 0.8;
        this.telemetry.rcSignal = 98;
        this.updateTelemetryDisplay();
    }

    takeoff() {
        this.flightStartTime = Date.now();
        document.getElementById('flight-drone-status').textContent = 'In Flight';
        
        document.getElementById('takeoff-btn').disabled = true;
        document.getElementById('land-btn').disabled = false;
        
        // Simulate takeoff
        const takeoffInterval = setInterval(() => {
            this.telemetry.altitude += 1;
            if (this.telemetry.altitude >= 50) {
                clearInterval(takeoffInterval);
            }
        }, 100);
    }

    land() {
        document.getElementById('flight-drone-status').textContent = 'Landing';
        
        // Simulate landing
        const landInterval = setInterval(() => {
            this.telemetry.altitude = Math.max(0, this.telemetry.altitude - 1);
            if (this.telemetry.altitude === 0) {
                clearInterval(landInterval);
                document.getElementById('flight-drone-status').textContent = 'Landed';
                document.getElementById('land-btn').disabled = true;
            }
        }, 100);
    }

    returnToHome() {
        if (confirm('Return to home position?')) {
            document.getElementById('flight-drone-status').textContent = 'Returning to Home';
            this.land();
        }
    }

    emergencyAbort() {
        if (confirm('EMERGENCY ABORT: This will immediately stop all motors. Confirm?')) {
            this.telemetry.altitude = 0;
            this.telemetry.speed = 0;
            this.isConnected = false;
            document.getElementById('flight-drone-status').textContent = 'Emergency Stop';
            document.getElementById('flight-drone-status').className = 'status-indicator disconnected';
            
            document.getElementById('arm-btn').disabled = false;
            document.getElementById('takeoff-btn').disabled = true;
            document.getElementById('land-btn').disabled = true;
        }
    }

    switchCamera() {
        alert('Camera switching not implemented - connect to actual drone');
    }

    toggleRecording() {
        const btn = document.getElementById('camera-record-btn');
        if (btn.textContent === 'Record') {
            btn.textContent = 'Stop';
            btn.style.backgroundColor = '#ef4444';
        } else {
            btn.textContent = 'Record';
            btn.style.backgroundColor = '';
        }
    }
}

// Initialize when page loads
let flightManager;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.droneManager && window.missionPlanner) {
            flightManager = new FlightManager(window.droneManager, window.missionPlanner);
            window.flightManager = flightManager;
        }
    });
} else {
    if (window.droneManager && window.missionPlanner) {
        flightManager = new FlightManager(window.droneManager, window.missionPlanner);
        window.flightManager = flightManager;
    }
}
