document.addEventListener('DOMContentLoaded', () => {
    initFlightDisplay();
    initTerminal();
});

// Global Flight Data Object
const flightData = {
    roll: 0,      // Degrees
    pitch: 0,     // Degrees
    altitude: 0,  // Meters
    speed: 0,     // m/s
    heading: 0,   // Degrees
    isArmed: false
};

// ==========================================
// 1. PRIMARY FLIGHT DISPLAY (PFD) ENGINE
// ==========================================
function initFlightDisplay() {
    const canvas = document.getElementById('artificial-horizon');
    const ctx = canvas.getContext('2d');

    // Handle High DPI Screens (Retina) for sharp lines
    function resizeCanvas() {
        const parent = canvas.parentElement;
        canvas.width = parent.clientWidth * window.devicePixelRatio;
        canvas.height = parent.clientHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        canvas.style.width = `${parent.clientWidth}px`;
        canvas.style.height = `${parent.clientHeight}px`;
    }
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Render Loop
    function render() {
        // Clear Screen
        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;
        ctx.clearRect(0, 0, width, height);

        // --- 1. Draw Sky and Ground (The Horizon) ---
        ctx.save();
        
        // Move to center of screen
        ctx.translate(width / 2, height / 2);
        
        // Rotate entire world by negative roll (World moves, plane stays still)
        ctx.rotate(-flightData.roll * Math.PI / 180);
        
        // Translate vertically for pitch (1 degree = approx 4 pixels)
        const pitchPixels = flightData.pitch * 4; 
        ctx.translate(0, pitchPixels);

        // Draw Sky (Airbus Blue) - Draw huge rectangle
        ctx.fillStyle = '#00a2e8'; 
        ctx.fillRect(-1000, -1000, 2000, 1000);

        // Draw Ground (Airbus Brown) - Draw huge rectangle
        ctx.fillStyle = '#9c5a3c'; 
        ctx.fillRect(-1000, 0, 2000, 1000);

        // Draw Horizon Line
        ctx.beginPath();
        ctx.moveTo(-1000, 0);
        ctx.lineTo(1000, 0);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Pitch Ladder (White Lines)
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '12px Arial';

        for (let i = -90; i <= 90; i += 10) {
            if (i === 0) continue; // Skip horizon line
            
            const y = -i * 4; // Scale 10 deg to pixels
            const width = (i % 20 === 0) ? 60 : 30; // Every 20 deg is wider
            
            ctx.beginPath();
            ctx.moveTo(-width, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            // Text numbers
            if (i % 10 === 0) {
                ctx.fillText(Math.abs(i), -width - 15, y);
                ctx.fillText(Math.abs(i), width + 15, y);
            }
        }

        ctx.restore(); // Undo rotation/translation for HUD elements

        // --- 2. Draw Fixed Aircraft Symbol (The "Bird") ---
        ctx.save();
        ctx.translate(width / 2, height / 2);
        
        // Black Outline for contrast
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        drawAircraftSymbol(ctx);
        
        // Yellow/Orange fill (Airbus style)
        ctx.strokeStyle = '#fff200'; // Bright Yellow
        ctx.lineWidth = 2;
        drawAircraftSymbol(ctx);
        
        ctx.restore();

        // --- 3. Draw Bank Indicator (Top) ---
        drawBankIndicator(ctx, width, height);

        requestAnimationFrame(render);
    }

    // Helper to draw the little plane symbol
    function drawAircraftSymbol(context) {
        context.beginPath();
        // Left Wing
        context.moveTo(-40, 0);
        context.lineTo(-10, 0);
        context.lineTo(-10, 10);
        // Right Wing
        context.moveTo(40, 0);
        context.lineTo(10, 0);
        context.lineTo(10, 10);
        // Center Dot
        context.moveTo(0, 0);
        context.arc(0, 0, 2, 0, Math.PI * 2);
        context.stroke();
    }

    function drawBankIndicator(context, w, h) {
        context.save();
        context.translate(w/2, 40);
        context.strokeStyle = '#ffffff';
        context.lineWidth = 2;
        
        // Draw Arc
        context.beginPath();
        context.arc(0, 0, 30, Math.PI, 0); // Top half circle
        context.stroke();

        // Draw Triangle Pointer
        context.fillStyle = '#fff200';
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(-5, -10);
        context.lineTo(5, -10);
        context.fill();

        context.restore();
    }

    // Start Simulation Loop (Mock Data so you see it move)
    let time = 0;
    setInterval(() => {
        time += 0.05;
        // Mock Sine Wave Motion
        flightData.roll = Math.sin(time) * 15; // +/- 15 degrees roll
        flightData.pitch = Math.sin(time * 0.5) * 5; // +/- 5 degrees pitch
        
        // Update HTML instruments to match
        document.getElementById('flight-heading').textContent = Math.floor((flightData.heading) % 360) + '°';
        document.getElementById('artificial-horizon').setAttribute('data-roll', flightData.roll);
    }, 50);

    // Start Rendering
    render();
}

// ==========================================
// 2. TERMINAL (CONSOLE) SYSTEM
// ==========================================
function initTerminal() {
    const overlay = document.getElementById('terminal-overlay');
    const input = document.getElementById('terminal-input');
    const output = document.getElementById('terminal-output');

    // Toggle on Tilde (`) Key
    document.addEventListener('keydown', (e) => {
        if (e.key === '`' || e.key === '~') {
            e.preventDefault(); // Stop ` from typing in input
            overlay.classList.toggle('active');
            if (overlay.classList.contains('active')) {
                input.focus();
            }
        }
    });

    // Handle Command Input
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const commandLine = input.value.trim();
            if (commandLine) {
                printToTerminal(`admin@darkstar:~$ ${commandLine}`);
                processCommand(commandLine);
            }
            input.value = ''; // Clear input
            // Auto scroll to bottom
            const outputDiv = document.querySelector('.terminal-output');
            outputDiv.scrollTop = outputDiv.scrollHeight;
        }
    });

    function printToTerminal(text, type = 'normal') {
        const line = document.createElement('div');
        line.textContent = text;
        if (type === 'error') line.style.color = '#ff3333';
        if (type === 'success') line.style.color = '#33ff33';
        output.appendChild(line);
    }

    function processCommand(cmdStr) {
        const parts = cmdStr.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (cmd) {
            case 'help':
                printToTerminal(`
    AVAILABLE COMMANDS:
    -------------------
    help          : Show this menu
    clear         : Clear terminal screen
    status        : Show current drone telemetry
    arm           : Arm the drone motors
    disarm        : Disarm motors
    set [var] [val]: Set variable (e.g., 'set alt 100')
    rtl           : Trigger Return-to-Launch
                `);
                break;

            case 'clear':
                output.innerHTML = '';
                break;

            case 'status':
                printToTerminal(`
    SYSTEM STATUS:
    --------------
    ARMED    : ${flightData.isArmed}
    ALTITUDE : ${flightData.altitude} m
    ROLL     : ${flightData.roll.toFixed(1)}°
    PITCH    : ${flightData.pitch.toFixed(1)}°
    BATTERY  : 98% (4.15v/cell)
                `);
                break;

            case 'arm':
                flightData.isArmed = true;
                printToTerminal('>> ARMING SEQUENCE INITIATED...', 'success');
                printToTerminal('>> MOTORS ARMED.', 'success');
                document.getElementById('flight-drone-status').textContent = "ARMED";
                document.getElementById('flight-drone-status').className = "status-indicator connected";
                break;

            case 'disarm':
                flightData.isArmed = false;
                printToTerminal('>> MOTORS DISARMED.', 'error');
                document.getElementById('flight-drone-status').textContent = "DISARMED";
                document.getElementById('flight-drone-status').className = "status-indicator warning";
                break;

            case 'set':
                if (args.length < 2) {
                    printToTerminal('Usage: set [parameter] [value]', 'error');
                    return;
                }
                const param = args[0];
                const val = parseFloat(args[1]);
                
                if (param === 'alt') {
                    flightData.altitude = val;
                    document.getElementById('flight-altitude').textContent = val + " m";
                    printToTerminal(`>> Target Altitude set to ${val}m`, 'success');
                } else if (param === 'speed') {
                    flightData.speed = val;
                    document.getElementById('flight-speed').textContent = val + " m/s";
                    printToTerminal(`>> Target Speed set to ${val}m/s`, 'success');
                } else {
                    printToTerminal(`Unknown parameter: ${param}`, 'error');
                }
                break;

            default:
                printToTerminal(`Command not found: ${cmd}. Type 'help' for options.`, 'error');
        }
    }
}
