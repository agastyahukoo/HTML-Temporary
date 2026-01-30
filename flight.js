Here is the updated full code for `flight.js`.

I have made the following changes:

1. **Updated `updateArtificialHorizon**`: The horizon now uses distinct Airbus-style colors (Sky Blue and Earth Brown) so it is clearly visible. The HUD elements (pitch ladder, bank indicator, FPV symbol) are drawn in high-contrast colors (White/Green/Yellow) to ensure visibility.
2. **Added Terminal System**: I added a `setupTerminal` method that injects a hidden terminal overlay into the page.
* Press the **Tilde (`~`) / Backtick (```)** key to toggle the terminal.
* Supported commands: `help`, `clear`, `status`, `arm`, `disarm`, `takeoff`, `land`.



### `flight.js`

```javascript
// Flight View - Live Drone Feed and Telemetry System

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
        this.setupTerminal(); // Initialize the terminal
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

    // --- TERMINAL IMPLEMENTATION ---
    setupTerminal() {
        // Inject Terminal HTML
        const terminalHTML = `
            <div id="flight-terminal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 50%; background: rgba(10, 10, 15, 0.95); z-index: 9999; border-bottom: 2px solid #3b82f6; font-family: 'Courier New', monospace; padding: 20px; box-sizing: border-box; color: #10b981; overflow: hidden; flex-direction: column;">
                <div id="terminal-output" style="flex: 1; overflow-y: auto; white-space: pre-wrap; margin-bottom: 10px; font-size: 14px;">Welcome to Darkstar Flight Console v1.0\nType 'help' for available commands.\n</div>
                <div style="display: flex; align-items: center;">
                    <span style="color: #3b82f6; margin-right: 10px;">root@darkstar:~#</span>
                    <input type="text" id="terminal-input" style="flex: 1; background: transparent; border: none; color: #e8e8e8; font-family: 'Courier New', monospace; font-size: 14px; outline: none;" autocomplete="off" spellcheck="false">
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', terminalHTML);

        const terminal = document.getElementById('flight-terminal');
        const input = document.getElementById('terminal-input');
        const output = document.getElementById('terminal-output');

        // Toggle Terminal on Tilde key
        document.addEventListener('keydown', (e) => {
            if (e.key === '`' || e.key === '~') {
                e.preventDefault();
                if (terminal.style.display === 'none') {
                    terminal.style.display = 'flex';
                    input.focus();
                } else {
                    terminal.style.display = 'none';
                }
            }
        });

        // Handle Input
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const command = input.value.trim();
                if (command) {
                    this.executeCommand(command, output);
                }
                input.value = '';
                // Keep scroll at bottom
                output.scrollTop = output.scrollHeight;
            }
        });
    }

    executeCommand(cmd, output) {
        // Echo command
        output.innerHTML += `<div style="color: #ccc;">> ${cmd}</div>`;

        const args = cmd.toLowerCase().split(' ');
        const command = args[0];

        let response = '';

        switch (command) {
            case 'help':
                response = `Available commands:
  help      - Show this help message
  status    - Show current telemetry status
  clear     - Clear terminal output
  arm       - Arm the drone
  disarm    - Disarm/Abort
  takeoff   - Initiate takeoff sequence
  land      - Initiate landing sequence
  set       - Set variable (usage: set alt 100)`;
                break;
            case 'clear':
                output.innerHTML = 'Welcome to Darkstar Flight Console v1.0\n';
                return;
            case 'status':
                response = `[SYSTEM STATUS]
  Connected: ${this.isConnected}
  Battery:   ${this.telemetry.battery}% (${this.telemetry.voltage.toFixed(1)}V)
  Altitude:  ${this.telemetry.altitude.toFixed(1)}m
  Speed:     ${this.telemetry.speed.toFixed(1)}m/s
  Heading:   ${this.telemetry.heading.toFixed(0)}°
  GPS:       ${this.telemetry.satellites} Sats (HDOP: ${this.telemetry.hdop})`;
                break;
            case 'arm':
                this.armDrone();
                response = 'Executing ARM sequence...';
                break;
            case 'disarm':
                this.emergencyAbort();
                response = 'Executing DISARM/ABORT sequence...';
                break;
            case 'takeoff':
                if (!this.isConnected) {
                    response = 'Error: Drone not armed.';
                } else {
                    this.takeoff();
                    response = 'Initiating Takeoff...';
                }
                break;
            case 'land':
                this.land();
                response = 'Initiating Landing...';
                break;
            case 'set':
                if (args[1] === 'alt' && args[2]) {
                    const alt = parseFloat(args[2]);
                    if (!isNaN(alt)) {
                        this.telemetry.altitude = alt;
                        response = `Altitude set to ${alt}m`;
                    } else {
                        response = 'Invalid altitude value.';
                    }
                } else {
                    response = 'Usage: set alt <value>';
                }
                break;
            default:
                response = `Command not found: ${command}`;
        }

        output.innerHTML += `<div>${response}</div>`;
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

    // Artificial Horizon - Airbus A320 Style (Updated)
    initArtificialHorizon() {
        const canvas = document.getElementById('artificial-horizon');
        if (!canvas) return;

        this.horizonCanvas = canvas;
        this.horizonCtx = canvas.getContext('2d');
        
        this.updateArtificialHorizon();
    }

    updateArtificialHorizon() {
        if (!this.horizonCanvas || !this.horizonCtx) return;

        const canvas = this.horizonCanvas;
        const ctx = this.horizonCtx;
        
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) / 2 - 20;

        const pitch = this.telemetry.pitch || 0;
        const roll = this.telemetry.roll || 0;

        // Save context
        ctx.save();
        
        // Clear background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Clip to circular display
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.clip();

        // Apply rotation for roll (rotates the sky/ground)
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((roll * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);

        // Calculate pitch offset (pixels per degree)
        const pitchScale = radius / 30; // 30 degrees visible range
        const pitchOffset = (pitch * pitchScale);

        // --- Draw Sky (Blue) ---
        // Top bright blue, bottom lighter blue (Airbus style)
        const skyGradient = ctx.createLinearGradient(0, centerY - radius * 2, 0, centerY);
        skyGradient.addColorStop(0, '#0055AA'); // Deep Sky
        skyGradient.addColorStop(1, '#55AAFF'); // Horizon Blue
        ctx.fillStyle = skyGradient;
        
        // Fill entire upper half relative to horizon line
        ctx.fillRect(0, -canvas.height, canvas.width, (centerY - pitchOffset) + canvas.height);

        // --- Draw Ground (Brown) ---
        // Top dark brown, bottom lighter
        const groundGradient = ctx.createLinearGradient(0, centerY, 0, centerY + radius * 2);
        groundGradient.addColorStop(0, '#8B4513'); // Saddle Brown
        groundGradient.addColorStop(1, '#4A3010'); // Dark Brown
        ctx.fillStyle = groundGradient;
        
        // Fill lower half
        ctx.fillRect(0, centerY - pitchOffset, canvas.width, canvas.height * 2);

        // --- Draw Horizon Line ---
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, centerY - pitchOffset);
        ctx.lineTo(canvas.width, centerY - pitchOffset);
        ctx.stroke();

        // --- Draw Pitch Ladder ---
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Range of pitch lines to draw (visible range)
        const minVisiblePitch = pitch - 40;
        const maxVisiblePitch = pitch + 40;

        for (let p = Math.ceil(minVisiblePitch / 10) * 10; p <= maxVisiblePitch; p += 2.5) {
            if (p === 0) continue; // Skip horizon line

            const y = centerY - pitchOffset - (p * pitchScale);
            
            // Check if within view
            if (y < centerY - radius || y > centerY + radius) continue;

            const isMajor = p % 10 === 0;
            const width = isMajor ? 60 : 30;
            
            ctx.beginPath();
            ctx.moveTo(centerX - width / 2, y);
            ctx.lineTo(centerX + width / 2, y);
            ctx.stroke();

            if (isMajor) {
                // Add text numbers
                ctx.fillText(Math.abs(p), centerX - width / 2 - 15, y);
                ctx.fillText(Math.abs(p), centerX + width / 2 + 15, y);
            }
        }

        ctx.restore(); // Restore from roll rotation

        // --- Fixed Elements (Not rotated by roll) ---

        // Draw Bank Scale (Top Arc)
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI * 0.8, -Math.PI * 0.2); // Top arc
        ctx.stroke();

        // Bank Markers
        const bankAngles = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
        bankAngles.forEach(angle => {
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate((angle * Math.PI) / 180);
            
            const tickLength = (angle % 30 === 0) ? 15 : 8;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.moveTo(0, -radius);
            ctx.lineTo(0, -radius + tickLength);
            ctx.stroke();

            // Triangle at 0 (Sky Pointer)
            if (angle === 0) {
                ctx.fillStyle = '#FFFF00'; // Yellow
                ctx.beginPath();
                ctx.moveTo(0, -radius + 15);
                ctx.lineTo(-6, -radius + 25);
                ctx.lineTo(6, -radius + 25);
                ctx.fill();
            }

            ctx.restore();
        });

        // --- Roll Indicator (Moving Triangle) ---
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((roll * Math.PI) / 180);
        
        // Yellow triangle indicating up relative to aircraft
        ctx.fillStyle = '#FFFF00'; 
        ctx.beginPath();
        ctx.moveTo(0, -radius + 5);
        ctx.lineTo(-8, -radius + 18);
        ctx.lineTo(8, -radius + 18);
        ctx.fill();
        ctx.restore();

        // --- Aircraft Symbol (Fixed Black/Yellow Wing) ---
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#FFFF00'; // Yellow outline
        ctx.fillStyle = '#000000'; // Black fill
        
        // Center Dot
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Wings
        ctx.beginPath();
        ctx.moveTo(centerX - 80, centerY); // Left Wing Tip
        ctx.lineTo(centerX - 20, centerY); // Left Wing Root
        ctx.lineTo(centerX - 20, centerY + 10);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(centerX + 80, centerY); // Right Wing Tip
        ctx.lineTo(centerX + 20, centerY); // Right Wing Root
        ctx.lineTo(centerX + 20, centerY + 10);
        ctx.stroke();

        // --- Digital Readouts (HUD style) ---
        // Pitch
        ctx.font = '16px monospace';
        ctx.fillStyle = '#00FF00'; // Green
        ctx.fillText(`PIT: ${pitch.toFixed(1)}°`, centerX - 120, centerY + 150);
        
        // Roll
        ctx.fillText(`ROL: ${roll.toFixed(1)}°`, centerX + 120, centerY + 150);

        ctx.restore();
        
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

```
