const { app, BrowserWindow, screen, ipcMain, Tray, Menu, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');

if (!app.isPackaged) {
	require('dotenv').config();
}

// Single-Instance Lock to prevent port collision (EADDRINUSE) and tray-restore failures
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
	console.log("Another instance is already running. Quitting.");
	app.quit();
	return;
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
	// Focus the existing window if user runs installer/app again
	if (mainWindow) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.show();
		mainWindow.focus();
		if (process.platform === 'win32') {
			mainWindow.flashFrame(true);
		}
	}
});

// Startup: Copy premium icon design if present
try {
	const srcIcon = path.join(__dirname, 'icon_design_1779380256320.png');
	const destIcon = path.join(__dirname, 'icon.png');
	if (fs.existsSync(srcIcon)) {
		let needCopy = true;
		if (fs.existsSync(destIcon)) {
			const srcStat = fs.statSync(srcIcon);
			const destStat = fs.statSync(destIcon);
			if (srcStat.size === destStat.size) {
				needCopy = false;
			}
		}
		if (needCopy) {
			fs.copyFileSync(srcIcon, destIcon);
			console.log("Startup: Premium icon successfully copied to icon.png!");
		}
	}
} catch (err) {
	console.error("Failed to copy premium icon at startup:", err);
}

let mainWindow;
let tray = null;


// Config Setup
const ffmpeg = require('fluent-ffmpeg');
let ffmpegPath = require('ffmpeg-static');
const http = require('http');

// Dynamically resolve ffmpeg path for packaged asar folder
if (app.isPackaged) {
	ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Dynamic Configuration Manager
const configPath = path.join(app.getPath('userData'), 'config.json');
let config = {};

function loadConfig() {
	if (fs.existsSync(configPath)) {
		try {
			config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
			console.log("Configuration loaded from config.json:", config);
		} catch (e) {
			console.error("Failed to load config.json:", e);
		}
	}
	
	// Fallback/Merge with .env or defaults (generic local network defaults)
	config.HA_URL = config.HA_URL || process.env.HA_URL || 'http://192.168.1.100:8123';
	config.HA_TOKEN = config.HA_TOKEN || process.env.HA_TOKEN || '';
	config.RTSP_URL = config.RTSP_URL || process.env.RTSP_URL || 'rtsp://username:password@192.168.1.100:554/live';
	
	// Initialize individual channel specific URLs
	for (let i = 1; i <= 5; i++) {
		config[`RTSP_URL_${i}`] = config[`RTSP_URL_${i}`] || process.env[`RTSP_URL_${i}`] || '';
	}
	
	config.DISPLAY_ID = config.DISPLAY_ID !== undefined ? parseInt(config.DISPLAY_ID) : parseInt(process.env.DISPLAY_ID || '0');
	config.DOORBELL_ENTITY = config.DOORBELL_ENTITY || process.env.DOORBELL_ENTITY || 'binary_sensor.doorbell';
	config.DOOR_OUTER_ENTITY = config.DOOR_OUTER_ENTITY || process.env.DOOR_OUTER_ENTITY || 'switch.dis_kapi_kontrol_dis_kapi';
	config.DOOR_INNER_ENTITY = config.DOOR_INNER_ENTITY || process.env.DOOR_INNER_ENTITY || 'switch.dis_kapi_kontrol_ic_kapi';
	config.DOORBELL_ACTION = config.DOORBELL_ACTION || 'open';
	config.AI_SENSITIVITY = config.AI_SENSITIVITY !== undefined ? parseFloat(config.AI_SENSITIVITY) : parseFloat(process.env.AI_SENSITIVITY || '0.55');
	config.AI_MIN_BOX_SIZE = config.AI_MIN_BOX_SIZE !== undefined ? parseFloat(config.AI_MIN_BOX_SIZE) : parseFloat(process.env.AI_MIN_BOX_SIZE || '0.04');
}

function resolveRtspUrl(channel) {
	if (!channel) return '';
	
	// If it is a direct Home Assistant camera entity, return empty string
	if (channel.startsWith('camera.')) {
		return '';
	}

	// Extract numerical channel ID if prefix rtsp_ is present
	const channelNum = channel.startsWith('rtsp_') ? channel.replace('rtsp_', '') : channel;

	// Check if a specific URL is configured for this specific channel
	const specificUrl = config[`RTSP_URL_${channelNum}`];
	if (specificUrl && specificUrl.trim() !== '') {
		console.log(`[RTSP Resolution] Using specific URL for Channel ${channelNum}: ${specificUrl}`);
		return specificUrl.trim();
	}

	// Fallback to base RTSP URL with dynamic channel parameter replacement
	let tspUrl = config.RTSP_URL || '';
	if (tspUrl.includes('channel=')) {
		tspUrl = tspUrl.replace(/channel=\d+/, `channel=${channelNum}`);
	} else {
		const separator = tspUrl.includes('?') ? '&' : '?';
		tspUrl = `${tspUrl}${separator}channel=${channelNum}&subtype=1&q=5`;
	}
	console.log(`[RTSP Resolution] Using base fallback URL for Channel ${channelNum}: ${tspUrl}`);
	return tspUrl;
}

function saveConfig(newConfig) {
	config = { ...config, ...newConfig };
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
		console.log("Configuration successfully written to config.json");
	} catch (e) {
		console.error("Failed to write config.json:", e);
	}
}

// Initial Load
loadConfig();

// Disable GPU cache to prevent permission errors
app.commandLine.appendSwitch('disable-chip-rendering');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

// Required for Windows Notifications to work (matching the installer appId to avoid shortcut duplication)
if (process.platform === 'win32') {
	app.setAppUserModelId('com.homeassistant.cameramonitor');
	
	// Clean up legacy manual shortcuts that caused duplicate programs listing
	const legacyNames = [
		'Kamera Gözcüsü.lnk',
		'Kamera Gozcusu.lnk',
		'cam monitor.lnk',
		'Cam Monitor.lnk',
		'ha-pc-cam-monitor.lnk',
		'HA PC Cam Monitor.lnk'
	];
	
	const locations = [
		path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
		path.join(app.getPath('desktop')),
		path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
	];
	
	locations.forEach(loc => {
		legacyNames.forEach(name => {
			try {
				const fullPath = path.join(loc, name);
				if (fs.existsSync(fullPath)) {
					fs.unlinkSync(fullPath);
					console.log(`Startup: Removed legacy duplicate shortcut '${name}' from '${loc}'`);
				}
			} catch (e) {
				console.error(`Startup: Failed to remove legacy shortcut '${name}' from '${loc}':`, e.trim());
			}
		});
	});
}

// --- Streaming Server ---
// --- Streaming Server (HLS) ---
let streamPort = 9999;
const streamDir = app.isPackaged
	? path.join(app.getPath('userData'), 'stream')
	: path.join(__dirname, 'stream');

// Ensure stream directory exists
if (!fs.existsSync(streamDir)) {
	fs.mkdirSync(streamDir, { recursive: true });
}

// Clean up old segments on start
try {
	const files = fs.readdirSync(streamDir);
	for (const file of files) {
		fs.unlinkSync(path.join(streamDir, file));
	}
} catch (e) { console.log("Cleanup error:", e); }

// ... (cleanup logic remains similar but needs to be careful)

// ... (cleanup logic remains similar)

// --- Multi-Stream Management ---
let activeCommands = {}; // Map: channelId -> ffmpegCommand

const startHlsStream = (channel) => {
	if (activeCommands[channel]) return; // Already running

	// If it is a direct Home Assistant camera entity, do not run FFmpeg transcode
	if (channel && channel.startsWith('camera.')) {
		console.log(`Channel ${channel} is a direct Home Assistant camera entity. Skipping FFmpeg transcoding.`);
		return;
	}

	// Extract numerical channel ID if prefix rtsp_ is present
	const channelNum = channel.startsWith('rtsp_') ? channel.replace('rtsp_', '') : channel;

	// Construct RTSP URL using our helper
	const tspUrl = resolveRtspUrl(channel);

	console.log(`Starting HLS for Channel ${channel} (NVR Port ${channelNum}): ${tspUrl}`);

	const command = ffmpeg(tspUrl)
		.inputOptions([
			'-rtsp_transport', 'tcp',
			'-re',
			'-hwaccel', 'auto'
		])
		.outputOptions([
			'-c:v', 'libx264',
			'-preset', 'ultrafast',
			'-tune', 'zerolatency',
			'-g', '25', // Keyframe every 1s (assuming 25fps) for faster seeking
			'-sc_threshold', '0',
			'-f', 'hls',
			'-hls_time', '1', // 1s segments for lower latency
			'-hls_list_size', '3', // Keep list short
			'-hls_flags', 'delete_segments+append_list+split_by_time',
			'-hls_segment_filename', path.join(streamDir, `segment_${channel}_%03d.ts`)
		])
		.output(path.join(streamDir, `index_${channel}.m3u8`))
		.on('start', () => console.log(`HLS Started (Channel ${channel})`))
		.on('error', (err) => {
			if (!err.message.includes('SIGKILL')) console.error(`HLS Error (${channel}):`, err.message);
			if (activeCommands[channel]) delete activeCommands[channel];
		})
		.on('end', () => {
			console.log(`HLS Ended (${channel})`);
			if (activeCommands[channel]) delete activeCommands[channel];
		});

	command.run();
	activeCommands[channel] = command;
};

const stopChannel = (channel) => {
	if (activeCommands[channel]) {
		console.log(`Stopping Channel ${channel}`);
		activeCommands[channel].kill('SIGKILL');
		delete activeCommands[channel];

		// Cleanup files
		try {
			const files = fs.readdirSync(streamDir);
			const pattern = new RegExp(`(index|segment)_${channel}_`);
			files.forEach(f => {
				if (f.match(pattern)) fs.unlinkSync(path.join(streamDir, f));
			});
		} catch (e) { }
	}
}

const streamServer = http.createServer((req, res) => {
	// CORS
	res.setHeader('Access-Control-Allow-Origin', '*');

	const url = new URL(req.url, `http://localhost:${streamPort}`);

	// MJPEG Ultra-Low Latency streaming endpoint
	if (url.pathname === '/mjpeg') {
		const channel = url.searchParams.get('channel') || '1';
		const channelNum = channel.startsWith('rtsp_') ? channel.replace('rtsp_', '') : channel;

		// Resolve RTSP URL using helper
		const tspUrl = resolveRtspUrl(channel);

		console.log(`[MJPEG] Direct low-latency request for Channel ${channelNum}: ${tspUrl}`);

		// Write headers for MJPEG streaming
		res.writeHead(200, {
			'Content-Type': 'multipart/x-mixed-replace; boundary=ffserver',
			'Connection': 'close',
			'Pragma': 'no-cache',
			'Cache-Control': 'no-cache, private, no-store, must-revalidate, max-age=0',
			'Expires': 0
		});

		// Spawn lightweight FFmpeg for immediate JPEG push without writing to disk
		const { spawn } = require('child_process');
		const ffmpegProcess = spawn(ffmpegPath, [
			'-rtsp_transport', 'tcp',
			'-fflags', 'nobuffer',
			'-flags', 'low_delay',
			'-strict', 'experimental',
			'-analyzeduration', '100000',
			'-probesize', '100000',
			'-i', tspUrl,
			'-c:v', 'mjpeg',
			'-q:v', '5', // High quality, low bandwidth overhead (1-31)
			'-an', // Disable audio for MJPEG
			'-f', 'mpjpeg',
			'-boundary_tag', 'ffserver',
			'pipe:1'
		]);

		ffmpegProcess.stdout.pipe(res);

		// Handle processes close cleanly on browser disconnection
		const killFFmpeg = () => {
			if (ffmpegProcess) {
				try {
					ffmpegProcess.kill('SIGKILL');
					console.log(`[MJPEG] FFmpeg stream for Channel ${channelNum} cleanly killed on socket close.`);
				} catch (err) {}
			}
		};

		req.on('close', killFFmpeg);
		req.on('end', killFFmpeg);
		res.on('close', killFFmpeg);
		res.on('finish', killFFmpeg);
		
		ffmpegProcess.on('error', (err) => {
			console.error(`[MJPEG] FFmpeg error for Channel ${channelNum}:`, err.message);
			killFFmpeg();
		});

		return;
	}

	// API: Manage Streams efficiently
	// ?channels=1,2  => Starts 1 and 2, Stops others.
	if (url.pathname === '/manage') {
		const desired = url.searchParams.get('channels'); // "1,2" or "1"
		const targetChannels = desired ? desired.split(',') : [];

		// 1. Stop anything NOT in target
		Object.keys(activeCommands).forEach(existingCh => {
			if (!targetChannels.includes(existingCh)) {
				stopChannel(existingCh);
			}
		});

		// 2. Start missing targets
		targetChannels.forEach(ch => {
			if (ch && !activeCommands[ch]) {
				startHlsStream(ch);
			}
		});

		res.writeHead(200);
		res.end('Managed');
		return;
	}

	// Legacy support for single switch
	if (url.pathname === '/switch') {
		const channel = url.searchParams.get('channel') || '1';
		// Stop all others for purity
		Object.keys(activeCommands).forEach(ch => { if (ch !== channel) stopChannel(ch); });
		startHlsStream(channel);
		res.writeHead(200);
		res.end('Switched');
		return;
	}

	// API for Webhook Trigger (Doorbell)
	if (url.pathname === '/trigger') {
		const event = url.searchParams.get('event');
		if (event === 'doorbell') {
			console.log("Doorbell Triggered via Webhook!");
			// Use the centralized handler that checks preferences
			handleDoorbellTrigger();
			res.writeHead(200);
			res.end('Triggered');
		} else {
			res.writeHead(400);
			res.end('Unknown event');
		}
		return;
	}

	// Serve HLS files
	if (url.pathname.startsWith('/stream/')) {
		const file = url.pathname.replace('/stream/', '');
		const filePath = path.join(streamDir, file);

		if (fs.existsSync(filePath)) {
			const ext = path.extname(filePath);
			const contentType = ext === '.m3u8' ? 'application/vnd.apple.mpegurl' : 'video/MP2T';

			res.writeHead(200, { 'Content-Type': contentType });
			fs.createReadStream(filePath).pipe(res);
		} else {
			res.writeHead(404);
			res.end();
		}
		return;
	}

	// Default 404
	res.writeHead(404);
	res.end();
});

function startStreamServer(port) {
	streamServer.once('error', (err) => {
		if (err.code === 'EADDRINUSE') {
			console.warn(`Port ${port} in use, trying fallback port ${port - 1}...`);
			startStreamServer(port - 1);
		} else {
			console.error("Stream server initialization error:", err);
		}
	});
	streamServer.listen(port, () => {
		streamPort = port;
		console.log(`HLS Server successfully running on port ${streamPort}`);
		// Don't auto start, renderer will request. Or start default.
		startHlsStream('1');
	});
}
startStreamServer(streamPort);


function createWindow() {
	const displays = screen.getAllDisplays();
	const targetDisplay = displays.find(d => d.id === config.DISPLAY_ID) || displays[0];

	mainWindow = new BrowserWindow({
		x: targetDisplay.bounds.x + 50,
		y: targetDisplay.bounds.y + 50,
		width: 800,
		height: 600,
		show: false, // Keep false initially, show when ready
		frame: false,
		titleBarStyle: 'hidden',
		icon: path.join(__dirname, 'icon.png'),
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			webSecurity: false // Disable CORS for local HA access
		},
		skipTaskbar: false // Show in taskbar
	});

	mainWindow.loadFile('index.html');

	// Show window when ready to prevent flickering
	mainWindow.once('ready-to-show', () => {
		mainWindow.show();
		mainWindow.focus();
	});

	mainWindow.on('close', (event) => {
		// Close to Tray: Hide instead of Quit
		if (!app.isQuitting) {
			event.preventDefault();
			mainWindow.hide();
			return false;
		}
		return true;
	});

	mainWindow.on('show', () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('window-state-changed', 'visible');
		}
	});

	mainWindow.on('hide', () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('window-state-changed', 'hidden');
		}
	});

	mainWindow.on('minimize', () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('window-state-changed', 'hidden');
		}
	});

	mainWindow.on('restore', () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('window-state-changed', 'visible');
		}
	});
}

function createTray() {
	tray = new Tray(path.join(__dirname, 'icon.png')); // Placeholder icon path
	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Show Window', click: () => showWindow() },
		{ label: 'Run at Startup', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: toggleAutoLaunch },
		{ type: 'separator' },
		{
			label: 'Exit', click: () => {
				app.isQuitting = true;
				if (mainWindow) mainWindow.close(); // Close event will now pass
				app.quit();
			}
		}
	]);
	tray.setToolTip('Camera Monitor');
	tray.setContextMenu(contextMenu);

	tray.on('click', () => showWindow());
}

function showWindow() {
	if (mainWindow) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.setAlwaysOnTop(true, 'screen-saver');
		mainWindow.show();
		mainWindow.focus();
		mainWindow.setAlwaysOnTop(false);
		if (process.platform === 'win32') {
			mainWindow.flashFrame(true);
		}
	}
}

function toggleAutoLaunch(item) {
	const settings = app.getLoginItemSettings();
	app.setLoginItemSettings({
		openAtLogin: !settings.openAtLogin,
		path: app.getPath('exe')
	});
}

// --- IPC Handlers ---
ipcMain.handle('get-config', () => {
	return { ...config, STREAM_PORT: streamPort };
});

ipcMain.handle('save-config', (event, newConfig) => {
	const oldDisplayId = config.DISPLAY_ID;
	const oldRtspUrl = config.RTSP_URL;
	const oldSpecificUrls = {};
	for (let i = 1; i <= 5; i++) {
		oldSpecificUrls[`RTSP_URL_${i}`] = config[`RTSP_URL_${i}`] || '';
	}
	
	saveConfig(newConfig);
	
	// If RTSP URL or any specific channel URL changed, restart active HLS streams
	let rtspChanged = config.RTSP_URL !== oldRtspUrl;
	for (let i = 1; i <= 5; i++) {
		if ((config[`RTSP_URL_${i}`] || '') !== oldSpecificUrls[`RTSP_URL_${i}`]) {
			rtspChanged = true;
		}
	}
	
	if (rtspChanged) {
		console.log("RTSP URL configuration changed, restarting active streams...");
		Object.keys(activeCommands).forEach(ch => {
			stopChannel(ch);
			startHlsStream(ch);
		});
	}
	
	// If DISPLAY_ID changed, move window to the new display dynamically
	if (config.DISPLAY_ID !== oldDisplayId && mainWindow) {
		const displays = screen.getAllDisplays();
		const targetDisplay = displays.find(d => d.id === config.DISPLAY_ID) || displays[0];
		if (targetDisplay) {
			mainWindow.setBounds({
				x: targetDisplay.bounds.x + 50,
				y: targetDisplay.bounds.y + 50,
				width: 800,
				height: 600
			});
			console.log(`Moved window to new target display: ${config.DISPLAY_ID}`);
		}
	}
	
	// Sync back to UI settings listeners if they listen to general updates
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send('config-updated', config);
	}
	
	return { ...config, STREAM_PORT: streamPort };
});

ipcMain.handle('get-displays', () => {
	return screen.getAllDisplays().map(d => ({
		id: d.id,
		label: `${d.label || 'Display'} (${d.bounds.width}x${d.bounds.height})`,
		isPrimary: d.id === screen.getPrimaryDisplay().id
	}));
});

ipcMain.on('minimize-window', () => {
	if (mainWindow) mainWindow.minimize();
});

ipcMain.on('restore-window', () => {
	showWindow();
});

ipcMain.on('test-doorbell', () => {
    // Test the doorbell ring natively
    console.log("Doorbell test triggered from UI");
    handleDoorbellTrigger();
});

ipcMain.on('save-video-recording', (event, data) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const recordDir = path.join(app.getPath('videos'), 'CameraMonitorRecordings');
        
        if (!fs.existsSync(recordDir)) {
            fs.mkdirSync(recordDir, { recursive: true });
        }
        
        // Generate timestamp YYYY-MM-DD_HH-MM-SS
        const now = new Date();
        const timestamp = now.getFullYear() + '-' + 
            String(now.getMonth() + 1).padStart(2, '0') + '-' + 
            String(now.getDate()).padStart(2, '0') + '_' + 
            String(now.getHours()).padStart(2, '0') + '-' + 
            String(now.getMinutes()).padStart(2, '0') + '-' + 
            String(now.getSeconds()).padStart(2, '0');
            
        const fileName = `Camera_${data.role}_${timestamp}.webm`;
        const filePath = path.join(recordDir, fileName);
        
        fs.writeFileSync(filePath, Buffer.from(data.buffer));
        console.log(`[DVR] Video saved to: ${filePath}`);
    } catch (err) {
        console.error("[DVR] Failed to save video:", err);
    }
});

ipcMain.on('show-notification', (event, title, body) => {
	const notif = new Notification({ title, body });
	notif.on('click', () => showWindow());
	notif.show();
});

// Centralized Trigger Logic
function handleDoorbellTrigger() {
	console.log("Handling Doorbell Trigger. Action:", config.DOORBELL_ACTION);

	// Notify Renderer (for UI update / sound / toast)
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send('doorbell-ring');
	}

	try {
		const notification = new Notification({
			title: 'Doorbell Ringing!',
			body: 'Doorbell was triggered. Click to view live feed.',
			icon: path.join(__dirname, 'icon.png')
		});
		notification.on('click', () => showWindow());
		notification.show();
	} catch (e) {
		console.error("Native notification failed:", e);
	}

	if (config.DOORBELL_ACTION === 'open') {
		showWindow();
	}
}

// Centralized Person Detected Trigger Logic
function handlePersonDetectedTrigger() {
	console.log("Handling Person Detected Trigger. Action:", config.DOORBELL_ACTION);

	// Notify Renderer (for UI update / sound / toast)
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send('person-detected-event');
	}

	try {
		const notification = new Notification({
			title: 'Motion Detected!',
			body: 'A person was detected at the door! Click to view live feed.',
			icon: path.join(__dirname, 'icon.png')
		});
		notification.on('click', () => showWindow());
		notification.show();
	} catch (e) {
		console.error("Native notification failed:", e);
	}

	if (config.DOORBELL_ACTION === 'open') {
		showWindow();
	}
}

ipcMain.on('trigger-event', (event, type) => {
	if (type === 'doorbell') handleDoorbellTrigger();
});

ipcMain.on('person-detected', () => {
	handlePersonDetectedTrigger();
});

app.whenReady().then(() => {
	// Create a dummy icon if it doesn't exist to prevent errors (optional, usually we just need a file)
	createWindow();
	createTray();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
