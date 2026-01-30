class FlightManager {
    constructor(droneManager, missionPlanner) {
        this.droneManager = droneManager;
        this.missionPlanner = missionPlanner;
        this.selectedDrone = null;
        this.selectedMission = null;
        this.isConnected = false;
        this.telemetryInterval = null;
        this.flightStartTime = null;
        this.activeCameraStream = null;
        
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
        this.initCameraSystem();
        this.setupResizablePanels();
    }
    
    setupViewObserver() {
        const flightView = document.getElementById('flight-view');
        if (!flightView) return;
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const isActive = flightView.classList.contains('active');
                    if (isActive && this.miniMap) {
                        setTimeout(() => {
                            this.miniMap.invalidateSize();
                            if (this.selectedMission) {
                                this.loadMissionOnMiniMap();
                            }
                        }, 200);
                    }
                }
            });
        });
        
        observer.observe(flightView, { attributes: true });
    }

    setupResizablePanels() {
        const container = document.querySelector('.flight-main-area');
        const leftPanel = document.querySelector('.camera-feed-panel');
        const rightPanel = document.querySelector('.instruments-panel');
        
        if (!container || !leftPanel || !rightPanel) return;

        const resizer = document.createElement('div');
        resizer.style.width = '6px';
        resizer.style.background = '#2a2a2a';
        resizer.style.cursor = 'col-resize';
        resizer.style.flexShrink = '0';
        resizer.style.zIndex = '100';
        
        container.insertBefore(resizer, rightPanel);

        container.style.display = 'flex';
        leftPanel.style.flex = '1';
        rightPanel.style.flex = '1';
        
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const containerRect = container.getBoundingClientRect();
            const pointerRelativeX = e.clientX - containerRect.left;
            
            const newLeftWidth = (pointerRelativeX / containerRect.width) * 100;
            
            if (newLeftWidth > 10 && newLeftWidth < 90) {
                leftPanel.style.flex = `0 0 ${newLeftWidth}%`;
                rightPanel.style.flex = `0 0 ${100 - newLeftWidth}%`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                if (this.miniMap) this.miniMap.invalidateSize();
            }
        });
    }

    async initCameraSystem() {
        const controls = document.querySelector('.camera-controls');
        const feedContainer = document.getElementById('camera-feed');
        
        if (!controls || !feedContainer) return;

        const switchBtn = document.getElementById('camera-switch-btn');
        if (switchBtn) switchBtn.remove();

        const select = document.createElement('select');
        select.style.background = '#252525';
        select.style.color = '#e8e8e8';
        select.style.border = '1px solid #3a3a3a';
        select.style.padding = '4px 8px';
        select.style.borderRadius = '4px';
        select.style.fontSize = '12px';
        select.style.marginRight = '8px';
        select.style.maxWidth = '150px';

        const defaultOption = document.createElement('option');
        defaultOption.text = 'Select Camera Source';
        defaultOption.value = '';
        select.appendChild(defaultOption);

        try {
            await navigator.mediaDevices.getUserMedia({ video: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${select.length}`;
                select.appendChild(option);
            });
        } catch (err) {
            console.error('Error accessing media devices:', err);
            defaultOption.text = 'Camera Access Denied';
        }

        controls.prepend(select);

        select.addEventListener('change', async (e) => {
            const deviceId = e.target.value;
            if (!deviceId) return;

            if (this.activeCameraStream) {
                this.activeCameraStream.getTracks().forEach(track => track.stop());
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: deviceId } }
                });
                
                this.activeCameraStream = stream;
                
                feedContainer.innerHTML = '';
                const video = document.createElement('video');
                video.srcObject = stream;
                video.autoplay = true;
                video.playsInline = true;
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'contain';
                video.style.backgroundColor = '#000';
                
                feedContainer.appendChild(video);
                
                const status = document.querySelector('.camera-status');
                if (status) status.textContent = 'Camera: Live';
                
            } catch (err) {
                console.error('Error starting video stream:', err);
                alert('Could not start camera feed');
            }
        });
    }

    setupEventListeners() {
        document.getElementById('flight-drone-select')?.addEventListener('change', (e) => {
            this.selectDrone(e.target.value);
        });

        document.getElementById('flight-mission-select')?.addEventListener('change', (e) => {
            this.selectMission(e.target.value);
        });

        document.getElementById('arm-btn')?.addEventListener('click', () => this.armDrone());
        document.getElementById('takeoff-btn')?.addEventListener('click', () => this.takeoff());
        document.getElementById('land-btn')?.addEventListener('click', () => this.land());
        document.getElementById('return-btn')?.addEventListener('click', () => this.returnToHome());
        document.getElementById('abort-btn')?.addEventListener('click', () => this.emergencyAbort());
        document.getElementById('camera-record-btn')?.addEventListener('click', () => this.toggleRecording());
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

        this.miniMap.eachLayer((layer) => {
            if (layer instanceof L.Polyline || (layer instanceof L.Marker && layer !== this.droneMarker)) {
                this.miniMap.removeLayer(layer);
            }
        });

        const waypoints = this.selectedMission.waypoints;
        if (waypoints && waypoints.length > 0) {
            const pathCoords = waypoints.map(wp => [wp.latitude, wp.longitude]);
            L.polyline(pathCoords, {
                color: '#10b981',
                weight: 2,
                opacity: 0.8
            }).addTo(this.miniMap);

            this.miniMap.fitBounds(pathCoords, { padding: [30, 30] });
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
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);

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

        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX, centerY - maxRadius * 0.8);
        ctx.stroke();

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
        
        if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }

        if (canvas.width === 0 || canvas.height === 0) {
            requestAnimationFrame(() => this.updateArtificialHorizon());
            return;
        }

        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 20;

        const pitch = this.telemetry.pitch || 0;
        const roll = this.telemetry.roll || 0;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.clip();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((-roll * Math.PI) / 180);
        
        const pitchScale = radius / 30; 
        const pitchPixelOffset = pitch * pitchScale;
        ctx.translate(0, pitchPixelOffset);

        ctx.fillStyle = '#3FB0F0'; 
        ctx.fillRect(-2000, -5000, 4000, 5000);

        ctx.fillStyle = '#8B5A2B';
        ctx.fillRect(-2000, 0, 4000, 5000);

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-2000, 0);
        ctx.lineTo(2000, 0);
        ctx.stroke();

        ctx.strokeStyle = '#FFFFFF';
        ctx.fillStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const startPitch = Math.floor((pitch - 40) / 2.5) * 2.5;
        const endPitch = Math.ceil((pitch + 40) / 2.5) * 2.5;

        for (let p = -90; p <= 90; p += 2.5) {
            if (p === 0) continue; 
            if (Math.abs(p - pitch) > 40) continue; 

            const y = -p * pitchScale; 
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

        ctx.restore(); 

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.stroke();

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

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((roll * Math.PI) / 180);
        
        ctx.fillStyle = '#FFFF00'; 
        ctx.beginPath();
        ctx.moveTo(0, -radius + 5); 
        ctx.lineTo(-8, -radius + 18);
        ctx.lineTo(8, -radius + 18);
        ctx.fill();
        ctx.restore();

        ctx.restore(); 

        ctx.lineWidth = 4;
        ctx.strokeStyle = '#FFFF00';
        ctx.fillStyle = '#000000';
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(centerX - 80, centerY); 
        ctx.lineTo(centerX - 20, centerY);
        ctx.lineTo(centerX - 20, centerY + 10);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(centerX + 80, centerY);
        ctx.lineTo(centerX + 20, centerY);
        ctx.lineTo(centerX + 20, centerY + 10);
        ctx.stroke();

        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#00FF00'; 
        
        ctx.fillText(`PIT: ${pitch.toFixed(1)}°`, centerX - 120, centerY + 150);
        ctx.fillText(`ROL: ${roll.toFixed(1)}°`, centerX + 120, centerY + 150);

        requestAnimationFrame(() => this.updateArtificialHorizon());
    }

    startTelemetrySimulation() {
        this.telemetryInterval = setInterval(() => {
            if (this.isConnected) {
                this.telemetry.pitch += (Math.random() - 0.5) * 0.5;
                this.telemetry.roll += (Math.random() - 0.5) * 0.5;
                this.telemetry.heading += (Math.random() - 0.5) * 0.2;
                
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

        document.getElementById('mini-map-heading').textContent = `${this.telemetry.heading.toFixed(0)}°`;
    }

    updateInstruments() {
        document.getElementById('flight-altitude').textContent = `${this.telemetry.altitude.toFixed(0)} m`;
        document.getElementById('flight-speed').textContent = `${this.telemetry.speed.toFixed(1)} m/s`;
        document.getElementById('flight-heading').textContent = `${this.telemetry.heading.toFixed(0)}°`;
        document.getElementById('flight-vspeed').textContent = `${this.telemetry.vspeed.toFixed(1)} m/s`;
    }

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
        
        const takeoffInterval = setInterval(() => {
            this.telemetry.altitude += 1;
            if (this.telemetry.altitude >= 50) {
                clearInterval(takeoffInterval);
            }
        }, 100);
    }

    land() {
        document.getElementById('flight-drone-status').textContent = 'Landing';
        
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
