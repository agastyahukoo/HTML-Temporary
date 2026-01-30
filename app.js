// UAV Flight Planner - Main Application Logic

class DroneManager {
    constructor() {
        this.drones = [];
        this.currentDrone = null;
        this.editMode = false;
        this.init();
    }

    init() {
        this.loadDrones();
        this.setupEventListeners();
        this.updateDroneList();
    }

    // Local Storage Management
    loadDrones() {
        const storedDrones = localStorage.getItem('uav_drones');
        if (storedDrones) {
            this.drones = JSON.parse(storedDrones);
        }
    }

    saveDrones() {
        localStorage.setItem('uav_drones', JSON.stringify(this.drones));
    }

    // Event Listeners
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchView(e.target.dataset.view));
        });

        // Create new drone
        document.getElementById('create-drone-btn').addEventListener('click', () => {
            this.createNewDrone();
        });

        // Save drone
        document.getElementById('save-drone-btn').addEventListener('click', () => {
            this.saveDrone();
        });

        // Cancel editing
        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.cancelEdit();
        });

        // Download spec sheet
        document.getElementById('download-spec-btn').addEventListener('click', () => {
            this.downloadSpecSheet();
        });

        // Drone type change - show/hide relevant fields
        document.getElementById('drone-type').addEventListener('change', (e) => {
            this.handleDroneTypeChange(e.target.value);
        });

        // Battery cells change - auto-calculate voltage
        document.getElementById('battery-cells').addEventListener('input', (e) => {
            this.calculateBatteryVoltage();
        });

        document.getElementById('battery-type').addEventListener('change', () => {
            this.calculateBatteryVoltage();
        });

        // Real-time calculations
        const calcFields = ['motor-count', 'motor-thrust', 'drone-weight', 'battery-capacity', 
                           'battery-cells', 'hover-current', 'cruise-speed', 'max-flight-time'];
        calcFields.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => this.updateCalculatedMetrics());
            }
        });
    }

    switchView(view) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        
        document.getElementById(`${view}-view`).classList.add('active');
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
    }

    // Drone List Management
    updateDroneList() {
        const droneList = document.getElementById('drone-list');
        const droneCount = document.getElementById('drone-count');
        
        // Update count
        if (droneCount) {
            droneCount.textContent = `${this.drones.length} Profile${this.drones.length !== 1 ? 's' : ''}`;
        }
        
        if (this.drones.length === 0) {
            droneList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                            <path d="M2 17l10 5 10-5"></path>
                            <path d="M2 12l10 5 10-5"></path>
                        </svg>
                    </div>
                    <p class="empty-state-title">No drone profiles yet</p>
                    <p class="empty-state-hint">Create your first drone profile to get started</p>
                </div>
            `;
            return;
        }

        droneList.innerHTML = this.drones.map((drone, index) => `
            <div class="drone-card ${this.currentDrone === drone ? 'active' : ''}" data-index="${index}">
                <div class="drone-card-header">
                    <div>
                        <div class="drone-card-title">${drone.name}</div>
                        <div class="drone-card-type">${this.formatDroneType(drone.type)}</div>
                    </div>
                    <div class="drone-card-actions">
                        <button class="icon-btn edit" data-action="edit" data-index="${index}" title="Edit">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="icon-btn delete" data-action="delete" data-index="${index}" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="drone-card-info">
                    ${drone.version ? `<div class="info-row"><span class="info-label">Version</span><span class="info-value">${drone.version}</span></div>` : ''}
                    <div class="info-row"><span class="info-label">Weight</span><span class="info-value">${drone.weight} kg</span></div>
                    <div class="info-row"><span class="info-label">Motors</span><span class="info-value">${drone.motorCount} × ${drone.motorKV} KV</span></div>
                    ${drone.batteryCapacity ? `<div class="info-row"><span class="info-label">Battery</span><span class="info-value">${drone.batteryCells}S ${drone.batteryCapacity}mAh</span></div>` : ''}
                </div>
            </div>
        `).join('');

        // Add event listeners to cards
        droneList.querySelectorAll('.drone-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.drone-card-actions')) {
                    const index = parseInt(card.dataset.index);
                    this.viewDrone(index);
                }
            });
        });

        // Add event listeners to action buttons
        droneList.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.editDrone(index);
            });
        });

        droneList.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.deleteDrone(index);
            });
        });
    }

    formatDroneType(type) {
        const typeMap = {
            'quadcopter': 'Quadcopter',
            'hexacopter': 'Hexacopter',
            'octocopter': 'Octocopter',
            'fixed-wing': 'Fixed-Wing UAV',
            'vtol': 'VTOL',
            'hybrid': 'Hybrid'
        };
        return typeMap[type] || type;
    }

    // Drone CRUD Operations
    createNewDrone() {
        this.editMode = false;
        this.currentDrone = null;
        this.showEditor('New Drone Profile');
        this.clearForm();
        document.getElementById('download-spec-btn').style.display = 'none';
    }

    viewDrone(index) {
        this.editMode = false;
        this.currentDrone = this.drones[index];
        this.showEditor(this.currentDrone.name);
        this.loadDroneToForm(this.currentDrone);
        document.getElementById('download-spec-btn').style.display = 'flex';
        this.updateDroneList();
        
        // Make form read-only
        document.getElementById('drone-form').querySelectorAll('input, select').forEach(el => {
            el.disabled = true;
        });
        document.getElementById('save-drone-btn').style.display = 'none';
    }

    editDrone(index) {
        this.editMode = true;
        this.currentDrone = this.drones[index];
        this.showEditor(`Edit: ${this.currentDrone.name}`);
        this.loadDroneToForm(this.currentDrone);
        document.getElementById('download-spec-btn').style.display = 'flex';
        this.updateDroneList();
        
        // Make form editable
        document.getElementById('drone-form').querySelectorAll('input, select').forEach(el => {
            el.disabled = false;
        });
        document.getElementById('save-drone-btn').style.display = 'flex';
    }

    deleteDrone(index) {
        if (confirm(`Are you sure you want to delete "${this.drones[index].name}"?`)) {
            this.drones.splice(index, 1);
            this.saveDrones();
            this.updateDroneList();
            
            if (this.currentDrone && this.currentDrone === this.drones[index]) {
                this.cancelEdit();
            }
        }
    }

    saveDrone() {
        const form = document.getElementById('drone-form');
        
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const droneData = this.getFormData();
        
        if (this.editMode && this.currentDrone) {
            // Update existing drone
            const index = this.drones.findIndex(d => d.id === this.currentDrone.id);
            if (index !== -1) {
                this.drones[index] = { ...droneData, id: this.currentDrone.id };
            }
        } else {
            // Create new drone
            droneData.id = Date.now().toString();
            this.drones.push(droneData);
        }

        this.saveDrones();
        this.updateDroneList();
        
        // Switch to view mode
        const savedIndex = this.drones.findIndex(d => d.id === droneData.id);
        this.viewDrone(savedIndex);
    }

    cancelEdit() {
        this.currentDrone = null;
        this.editMode = false;
        this.hideEditor();
        this.updateDroneList();
    }

    // Form Management
    showEditor(title) {
        document.getElementById('editor-placeholder').style.display = 'none';
        document.getElementById('drone-editor').style.display = 'flex';
        document.getElementById('editor-title').textContent = title;
    }

    hideEditor() {
        document.getElementById('editor-placeholder').style.display = 'flex';
        document.getElementById('drone-editor').style.display = 'none';
    }

    clearForm() {
        document.getElementById('drone-form').reset();
        document.getElementById('drone-form').querySelectorAll('input, select').forEach(el => {
            el.disabled = false;
        });
        document.getElementById('save-drone-btn').style.display = 'flex';
        document.querySelector('.calculated-metrics').style.display = 'none';
    }

    getFormData() {
        return {
            // Basic Information
            name: document.getElementById('drone-name').value,
            type: document.getElementById('drone-type').value,
            version: document.getElementById('drone-version').value,
            weight: parseFloat(document.getElementById('drone-weight').value),

            // Airframe
            wingspan: parseFloat(document.getElementById('wingspan').value) || null,
            frameSize: parseFloat(document.getElementById('frame-size').value) || null,
            material: document.getElementById('material').value,
            fuselageLength: parseFloat(document.getElementById('fuselage-length').value) || null,

            // Motors
            motorCount: parseInt(document.getElementById('motor-count').value),
            motorBrand: document.getElementById('motor-brand').value,
            motorModel: document.getElementById('motor-model').value,
            motorKV: parseInt(document.getElementById('motor-kv').value),
            motorThrust: parseFloat(document.getElementById('motor-thrust').value),
            propellerSize: document.getElementById('propeller-size').value,
            propellerType: document.getElementById('propeller-type').value,

            // ESC
            escBrand: document.getElementById('esc-brand').value,
            escModel: document.getElementById('esc-model').value,
            escCurrent: parseFloat(document.getElementById('esc-current').value) || null,
            escProtocol: document.getElementById('esc-protocol').value,

            // Flight Controller
            fcBrand: document.getElementById('fc-brand').value,
            fcModel: document.getElementById('fc-model').value,
            fcFirmware: document.getElementById('fc-firmware').value,
            fcGPS: document.getElementById('fc-gps').value,

            // Battery
            batteryType: document.getElementById('battery-type').value,
            batteryCells: parseInt(document.getElementById('battery-cells').value),
            batteryCapacity: parseInt(document.getElementById('battery-capacity').value),
            batteryCRating: parseFloat(document.getElementById('battery-c-rating').value) || null,
            batteryVoltage: parseFloat(document.getElementById('battery-voltage').value) || null,
            batteryWeight: parseFloat(document.getElementById('battery-weight').value) || null,

            // Performance
            maxSpeed: parseFloat(document.getElementById('max-speed').value) || null,
            cruiseSpeed: parseFloat(document.getElementById('cruise-speed').value),
            hoverCurrent: parseFloat(document.getElementById('hover-current').value) || null,
            maxFlightTime: parseFloat(document.getElementById('max-flight-time').value) || null,
            windResistance: parseFloat(document.getElementById('wind-resistance').value) || null,
            maxAltitude: parseFloat(document.getElementById('max-altitude').value) || null,

            // Timestamp
            createdAt: this.currentDrone?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    loadDroneToForm(drone) {
        // Basic Information
        document.getElementById('drone-name').value = drone.name || '';
        document.getElementById('drone-type').value = drone.type || '';
        document.getElementById('drone-version').value = drone.version || '';
        document.getElementById('drone-weight').value = drone.weight || '';

        // Airframe
        document.getElementById('wingspan').value = drone.wingspan || '';
        document.getElementById('frame-size').value = drone.frameSize || '';
        document.getElementById('material').value = drone.material || '';
        document.getElementById('fuselage-length').value = drone.fuselageLength || '';

        // Motors
        document.getElementById('motor-count').value = drone.motorCount || '';
        document.getElementById('motor-brand').value = drone.motorBrand || '';
        document.getElementById('motor-model').value = drone.motorModel || '';
        document.getElementById('motor-kv').value = drone.motorKV || '';
        document.getElementById('motor-thrust').value = drone.motorThrust || '';
        document.getElementById('propeller-size').value = drone.propellerSize || '';
        document.getElementById('propeller-type').value = drone.propellerType || '';

        // ESC
        document.getElementById('esc-brand').value = drone.escBrand || '';
        document.getElementById('esc-model').value = drone.escModel || '';
        document.getElementById('esc-current').value = drone.escCurrent || '';
        document.getElementById('esc-protocol').value = drone.escProtocol || '';

        // Flight Controller
        document.getElementById('fc-brand').value = drone.fcBrand || '';
        document.getElementById('fc-model').value = drone.fcModel || '';
        document.getElementById('fc-firmware').value = drone.fcFirmware || '';
        document.getElementById('fc-gps').value = drone.fcGPS || '';

        // Battery
        document.getElementById('battery-type').value = drone.batteryType || '';
        document.getElementById('battery-cells').value = drone.batteryCells || '';
        document.getElementById('battery-capacity').value = drone.batteryCapacity || '';
        document.getElementById('battery-c-rating').value = drone.batteryCRating || '';
        document.getElementById('battery-voltage').value = drone.batteryVoltage || '';
        document.getElementById('battery-weight').value = drone.batteryWeight || '';

        // Performance
        document.getElementById('max-speed').value = drone.maxSpeed || '';
        document.getElementById('cruise-speed').value = drone.cruiseSpeed || '';
        document.getElementById('hover-current').value = drone.hoverCurrent || '';
        document.getElementById('max-flight-time').value = drone.maxFlightTime || '';
        document.getElementById('wind-resistance').value = drone.windResistance || '';
        document.getElementById('max-altitude').value = drone.maxAltitude || '';

        this.handleDroneTypeChange(drone.type);
        this.updateCalculatedMetrics();
    }

    handleDroneTypeChange(type) {
        const wingspanGroup = document.querySelector('.wingspan-group');
        const frameSizeGroup = document.querySelector('.frame-size-group');

        if (type === 'fixed-wing' || type === 'vtol' || type === 'hybrid') {
            wingspanGroup.style.display = 'flex';
            frameSizeGroup.style.display = 'none';
        } else {
            wingspanGroup.style.display = 'none';
            frameSizeGroup.style.display = 'flex';
        }
    }

    calculateBatteryVoltage() {
        const cells = parseInt(document.getElementById('battery-cells').value);
        const type = document.getElementById('battery-type').value;
        
        if (!cells || !type) return;

        const voltagePerCell = {
            'lipo': 3.7,
            'li-ion': 3.6,
            'lifepo4': 3.2,
            'nimh': 1.2
        };

        const voltage = cells * (voltagePerCell[type] || 3.7);
        document.getElementById('battery-voltage').value = voltage.toFixed(1);
    }

    updateCalculatedMetrics() {
        const motorCount = parseInt(document.getElementById('motor-count').value);
        const motorThrust = parseFloat(document.getElementById('motor-thrust').value);
        const droneWeight = parseFloat(document.getElementById('drone-weight').value);
        const batteryCapacity = parseInt(document.getElementById('battery-capacity').value);
        const hoverCurrent = parseFloat(document.getElementById('hover-current').value);
        const cruiseSpeed = parseFloat(document.getElementById('cruise-speed').value);

        if (!motorCount || !motorThrust || !droneWeight) {
            document.querySelector('.calculated-metrics').style.display = 'none';
            return;
        }

        document.querySelector('.calculated-metrics').style.display = 'block';

        // Total Thrust
        const totalThrust = (motorCount * motorThrust) / 1000; // Convert g to kg
        document.getElementById('calc-total-thrust').textContent = `${totalThrust.toFixed(2)} kg`;

        // Thrust-to-Weight Ratio
        const twr = totalThrust / droneWeight;
        document.getElementById('calc-twr').textContent = twr.toFixed(2);
        document.getElementById('calc-twr').className = 'metric-value ' + 
            (twr >= 2 ? 'text-success' : twr >= 1.5 ? 'text-warning' : 'text-danger');

        // Estimated Flight Time
        if (batteryCapacity && hoverCurrent && hoverCurrent > 0) {
            const flightTime = (batteryCapacity / 1000) / hoverCurrent * 60 * 0.8; // 80% battery capacity safety
            document.getElementById('calc-flight-time').textContent = `${flightTime.toFixed(1)} min`;
        } else {
            document.getElementById('calc-flight-time').textContent = '-';
        }

        // Estimated Range
        if (cruiseSpeed && batteryCapacity && hoverCurrent && hoverCurrent > 0) {
            const flightTime = (batteryCapacity / 1000) / hoverCurrent * 0.8; // in hours
            const range = cruiseSpeed * flightTime * 3600 / 1000; // Convert to km
            document.getElementById('calc-range').textContent = `${range.toFixed(2)} km`;
        } else {
            document.getElementById('calc-range').textContent = '-';
        }
    }

    // Export Spec Sheet as PDF
    downloadSpecSheet() {
        if (!this.currentDrone) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const drone = this.currentDrone;
        const metrics = this.calculateDetailedMetrics(drone);
        let yPos = 20;
        const leftMargin = 20;
        const lineHeight = 7;

        // Title
        doc.setFontSize(20);
        doc.setFont(undefined, 'bold');
        doc.text('UAV Specification Sheet', leftMargin, yPos);
        yPos += 15;

        // Drone Name and Type
        doc.setFontSize(16);
        doc.text(drone.name, leftMargin, yPos);
        yPos += 8;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Type: ${this.formatDroneType(drone.type)}${drone.version ? ' | Version: ' + drone.version : ''}`, leftMargin, yPos);
        yPos += 3;
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleString()}`, leftMargin, yPos += lineHeight);
        doc.setTextColor(0);
        yPos += 8;

        // Basic Information
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Basic Information', leftMargin, yPos);
        doc.setDrawColor(59, 130, 246);
        doc.line(leftMargin, yPos + 1, 190, yPos + 1);
        yPos += lineHeight;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Total Weight: ${drone.weight} kg`, leftMargin + 5, yPos);
        yPos += lineHeight;

        // Airframe
        if (drone.wingspan || drone.frameSize || drone.material) {
            yPos += 2;
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('Airframe Specifications', leftMargin, yPos);
            doc.line(leftMargin, yPos + 1, 190, yPos + 1);
            yPos += lineHeight;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            if (drone.wingspan) {
                doc.text(`Wingspan: ${drone.wingspan} m`, leftMargin + 5, yPos);
                yPos += lineHeight;
            }
            if (drone.frameSize) {
                doc.text(`Frame Size: ${drone.frameSize} mm`, leftMargin + 5, yPos);
                yPos += lineHeight;
            }
            if (drone.material) {
                doc.text(`Material: ${drone.material}`, leftMargin + 5, yPos);
                yPos += lineHeight;
            }
            if (drone.fuselageLength) {
                doc.text(`Fuselage Length: ${drone.fuselageLength} m`, leftMargin + 5, yPos);
                yPos += lineHeight;
            }
        }

        // Motor Configuration
        yPos += 2;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Motor Configuration', leftMargin, yPos);
        doc.line(leftMargin, yPos + 1, 190, yPos + 1);
        yPos += lineHeight;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Number of Motors: ${drone.motorCount}`, leftMargin + 5, yPos);
        yPos += lineHeight;
        if (drone.motorBrand) {
            doc.text(`Motor: ${drone.motorBrand} ${drone.motorModel || ''}`, leftMargin + 5, yPos);
            yPos += lineHeight;
        }
        doc.text(`KV Rating: ${drone.motorKV}`, leftMargin + 5, yPos);
        yPos += lineHeight;
        doc.text(`Max Thrust per Motor: ${drone.motorThrust} g`, leftMargin + 5, yPos);
        yPos += lineHeight;
        if (drone.propellerSize) {
            doc.text(`Propeller: ${drone.propellerSize}${drone.propellerType ? ' (' + drone.propellerType + ')' : ''}`, leftMargin + 5, yPos);
            yPos += lineHeight;
        }

        // ESC
        if (drone.escBrand || drone.escModel) {
            yPos += 2;
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('ESC Configuration', leftMargin, yPos);
            doc.line(leftMargin, yPos + 1, 190, yPos + 1);
            yPos += lineHeight;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`ESC: ${drone.escBrand || ''} ${drone.escModel || ''}`, leftMargin + 5, yPos);
            yPos += lineHeight;
            if (drone.escCurrent) {
                doc.text(`Current Rating: ${drone.escCurrent} A`, leftMargin + 5, yPos);
                yPos += lineHeight;
            }
            if (drone.escProtocol) {
                doc.text(`Protocol: ${drone.escProtocol}`, leftMargin + 5, yPos);
                yPos += lineHeight;
            }
        }

        // Flight Controller
        if (drone.fcBrand || drone.fcModel) {
            yPos += 2;
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('Flight Controller', leftMargin, yPos);
            doc.line(leftMargin, yPos + 1, 190, yPos + 1);
            yPos += lineHeight;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`FC: ${drone.fcBrand || ''} ${drone.fcModel || ''}`, leftMargin + 5, yPos);
            yPos += lineHeight;
            if (drone.fcFirmware) {
                doc.text(`Firmware: ${drone.fcFirmware}`, leftMargin + 5, yPos);
                yPos += lineHeight;
            }
            if (drone.fcGPS) {
                doc.text(`GPS: ${drone.fcGPS}`, leftMargin + 5, yPos);
                yPos += lineHeight;
            }
        }

        // Check if we need a new page
        if (yPos > 240) {
            doc.addPage();
            yPos = 20;
        }

        // Battery Configuration
        yPos += 2;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Battery Configuration', leftMargin, yPos);
        doc.line(leftMargin, yPos + 1, 190, yPos + 1);
        yPos += lineHeight;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Type: ${drone.batteryType.toUpperCase()}`, leftMargin + 5, yPos);
        yPos += lineHeight;
        doc.text(`Configuration: ${drone.batteryCells}S`, leftMargin + 5, yPos);
        yPos += lineHeight;
        doc.text(`Capacity: ${drone.batteryCapacity} mAh`, leftMargin + 5, yPos);
        yPos += lineHeight;
        if (drone.batteryCRating) {
            doc.text(`C-Rating: ${drone.batteryCRating}C`, leftMargin + 5, yPos);
            yPos += lineHeight;
        }
        doc.text(`Nominal Voltage: ${drone.batteryVoltage} V`, leftMargin + 5, yPos);
        yPos += lineHeight;
        if (drone.batteryWeight) {
            doc.text(`Battery Weight: ${drone.batteryWeight} g`, leftMargin + 5, yPos);
            yPos += lineHeight;
        }

        // Performance Parameters
        yPos += 2;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Performance Parameters', leftMargin, yPos);
        doc.line(leftMargin, yPos + 1, 190, yPos + 1);
        yPos += lineHeight;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        if (drone.maxSpeed) {
            doc.text(`Max Speed: ${drone.maxSpeed} m/s`, leftMargin + 5, yPos);
            yPos += lineHeight;
        }
        doc.text(`Cruise Speed: ${drone.cruiseSpeed} m/s`, leftMargin + 5, yPos);
        yPos += lineHeight;
        if (drone.hoverCurrent) {
            doc.text(`Hover Current: ${drone.hoverCurrent} A`, leftMargin + 5, yPos);
            yPos += lineHeight;
        }
        if (drone.maxFlightTime) {
            doc.text(`Max Flight Time: ${drone.maxFlightTime} min`, leftMargin + 5, yPos);
            yPos += lineHeight;
        }
        if (drone.windResistance) {
            doc.text(`Wind Resistance: ${drone.windResistance} m/s`, leftMargin + 5, yPos);
            yPos += lineHeight;
        }
        if (drone.maxAltitude) {
            doc.text(`Max Altitude: ${drone.maxAltitude} m`, leftMargin + 5, yPos);
            yPos += lineHeight;
        }

        // Calculated Metrics
        yPos += 5;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Calculated Performance Metrics', leftMargin, yPos);
        doc.line(leftMargin, yPos + 1, 190, yPos + 1);
        yPos += lineHeight;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Total Thrust: ${metrics.totalThrust}`, leftMargin + 5, yPos);
        yPos += lineHeight;
        doc.text(`Thrust-to-Weight Ratio: ${metrics.thrustToWeightRatio}`, leftMargin + 5, yPos);
        yPos += lineHeight;
        doc.text(`Estimated Flight Time: ${metrics.estimatedFlightTime}`, leftMargin + 5, yPos);
        yPos += lineHeight;
        doc.text(`Estimated Range: ${metrics.estimatedRange}`, leftMargin + 5, yPos);
        yPos += lineHeight;

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text('Generated by UAV Flight Planner', leftMargin, 285);
        doc.text(`Document ID: ${drone.id}`, 190, 285, { align: 'right' });

        // Save PDF
        doc.save(`${drone.name.replace(/\s+/g, '_')}_spec_sheet.pdf`);
    }

    calculateDetailedMetrics(drone) {
        const totalThrust = (drone.motorCount * drone.motorThrust) / 1000;
        const twr = totalThrust / drone.weight;
        
        let flightTime = null;
        let range = null;

        if (drone.batteryCapacity && drone.hoverCurrent && drone.hoverCurrent > 0) {
            flightTime = (drone.batteryCapacity / 1000) / drone.hoverCurrent * 60 * 0.8;
            
            if (drone.cruiseSpeed) {
                range = drone.cruiseSpeed * ((drone.batteryCapacity / 1000) / drone.hoverCurrent * 0.8) * 3.6;
            }
        }

        return {
            totalThrust: `${totalThrust.toFixed(2)} kg`,
            thrustToWeightRatio: twr.toFixed(2),
            estimatedFlightTime: flightTime ? `${flightTime.toFixed(1)} min` : 'N/A',
            estimatedRange: range ? `${range.toFixed(2)} km` : 'N/A',
            powerSystem: {
                totalMotors: drone.motorCount,
                totalThrust: `${totalThrust.toFixed(2)} kg`,
                thrustPerMotor: `${drone.motorThrust} g`
            },
            batteryInfo: {
                totalCapacity: `${drone.batteryCapacity} mAh`,
                voltage: `${drone.batteryVoltage} V`,
                configuration: `${drone.batteryCells}S`,
                chemistry: drone.batteryType.toUpperCase()
            }
        };
    }

    // Get drone by ID (for mission planner)
    getDroneById(id) {
        return this.drones.find(d => d.id === id);
    }

    getAllDrones() {
        return this.drones;
    }
}

// Initialize the application
const droneManager = new DroneManager();

// Make droneManager globally accessible for mission planner
window.droneManager = droneManager;
