const { ipcRenderer } = require('electron');
const axios = require('axios');
const Hls = require('hls.js');

// --- DOM Elements ---
// Reactive wrappers to sync state across multiple duplicate selector elements
const viewModeSelect = {
	get value() {
		const el = document.querySelector('.mode-select');
		return el ? el.value : '';
	},
	set value(val) {
		document.querySelectorAll('.mode-select').forEach(sel => {
			sel.value = val;
		});
	},
	addEventListener(event, callback) {
		document.querySelectorAll('.mode-select').forEach(sel => {
			sel.addEventListener(event, (e) => {
				document.querySelectorAll('.mode-select').forEach(other => {
					if (other !== e.target) other.value = e.target.value;
				});
				callback(e);
			});
		});
	}
};

const cameraSelect = {
	get value() {
		const el = document.querySelector('.camera-select');
		return el ? el.value : '';
	},
	set value(val) {
		document.querySelectorAll('.camera-select').forEach(sel => {
			sel.value = val;
		});
	},
	get style() {
		return {
			set display(val) {
				document.querySelectorAll('.camera-select').forEach(sel => {
					sel.style.display = val;
				});
			}
		};
	},
	set innerHTML(html) {
		document.querySelectorAll('.camera-select').forEach(sel => {
			sel.innerHTML = html;
		});
	},
	addEventListener(event, callback) {
		document.querySelectorAll('.camera-select').forEach(sel => {
			sel.addEventListener(event, (e) => {
				document.querySelectorAll('.camera-select').forEach(other => {
					if (other !== e.target) other.value = e.target.value;
				});
				callback(e);
			});
		});
	}
};

const videoContainerSingle = document.getElementById('video-container-single');
const videoContainerGrid = document.getElementById('video-container-grid');

const videoSingle = document.getElementById('video-stream');
const imgStreamSingle = document.getElementById('img-stream-single');
const canvasSingle = document.getElementById('canvas-single');
const loaderSingle = document.getElementById('loader-single');

const slotWidget = document.getElementById('slot-widget');
const widgetUnlockOuter = document.getElementById('widget-unlock-outer');
const widgetUnlockInner = document.getElementById('widget-unlock-inner');

const connectionStatus = document.getElementById('connection-status');
const closeBtn = document.getElementById('close-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const sessionTimer = document.getElementById('session-timer');
const liveBadge = document.querySelector('.live-badge');
const doorOuterBtn = document.getElementById('open-outer-btn');
const doorInnerBtn = document.getElementById('open-inner-btn');
const controlsContainer = document.querySelector('.controls-container');
const statusBar = document.getElementById('status-bar');

// --- In-App Toast Elements ---
const toastContainer = document.getElementById('toast-container');
const toastBanner = document.getElementById('toast-banner');
const toastIcon = document.getElementById('toast-icon');
const toastTitle = document.getElementById('toast-title');
const toastBody = document.getElementById('toast-body');
const toastClose = document.getElementById('toast-close');

// --- Talk Intercom Buttons ---
const talkBtn = document.getElementById('talk-btn');
const talkBtnText = document.getElementById('talk-btn-text');
const talkWave = document.getElementById('talk-wave');

// --- Onboarding Wizard Elements ---
const onboardingWizard = document.getElementById('onboarding-wizard');
const wizardPrevBtn = document.getElementById('wizard-prev-btn');
const wizardNextBtn = document.getElementById('wizard-next-btn');
const wizardFinishBtn = document.getElementById('wizard-finish-btn');
const wizardDisplaySelect = document.getElementById('wizard-display-select');
const wizardAiSlider = document.getElementById('wizard-ai-sensitivity');
const wizardAiSliderVal = document.getElementById('wizard-ai-sensitivity-val');

// --- Grid Slots Mapping ---
const slots = {
	'1': {
		el: document.getElementById('slot-1'),
		video: document.getElementById('video-1'),
		img: document.getElementById('img-stream-1'),
		canvas: document.getElementById('canvas-1'),
		loader: document.getElementById('loader-1'),
		select: document.getElementById('cam-select-1')
	},
	'2': {
		el: document.getElementById('slot-2'),
		video: document.getElementById('video-2'),
		img: document.getElementById('img-stream-2'),
		canvas: document.getElementById('canvas-2'),
		loader: document.getElementById('loader-2'),
		select: document.getElementById('cam-select-2')
	},
	'3': {
		el: document.getElementById('slot-3'),
		video: document.getElementById('video-3'),
		img: document.getElementById('img-stream-3'),
		canvas: document.getElementById('canvas-3'),
		loader: document.getElementById('loader-3'),
		select: document.getElementById('cam-select-3')
	},
	'4': {
		el: document.getElementById('slot-4'),
		video: document.getElementById('video-4'),
		img: document.getElementById('img-stream-4'),
		canvas: document.getElementById('canvas-4'),
		loader: document.getElementById('loader-4'),
		select: document.getElementById('cam-select-4')
	},
	'5': {
		el: document.getElementById('slot-5'),
		video: document.getElementById('video-5'),
		img: document.getElementById('img-stream-5'),
		canvas: document.getElementById('canvas-5'),
		loader: document.getElementById('loader-5'),
		select: document.getElementById('cam-select-5')
	}
};

// --- Dynamic Configuration ---
let config = {
	HA_URL: 'http://192.168.1.100:8123',
	HA_TOKEN: '',
	RTSP_URL: '',
	DISPLAY_ID: 0,
	DOORBELL_ENTITY: 'binary_sensor.doorbell',
	DOOR_OUTER_ENTITY: 'switch.outer_door',
	DOOR_INNER_ENTITY: 'switch.inner_door',
	DOORBELL_ACTION: 'open',
	AI_SENSITIVITY: 0.40,
	AI_MIN_BOX_SIZE: 0.015
};

let streamPort = 9999;

// --- State ---
let viewMode = localStorage.getItem('viewMode') || 'single';
let singleCh = localStorage.getItem('singleCh') || 'rtsp_1';
let camCh1 = localStorage.getItem('camCh1') || 'rtsp_1';
let camCh2 = localStorage.getItem('camCh2') || 'rtsp_2';
let camCh3 = localStorage.getItem('camCh3') || 'rtsp_3';
let camCh4 = localStorage.getItem('camCh4') || 'rtsp_4';
let camCh5 = localStorage.getItem('camCh5') || 'rtsp_5';

let haSocket = null;
let reconnectTimer = null;
let haCameras = [];

// --- HLS Players & Polling Streams state ---
let hlsPlayers = { main: null, '1': null, '2': null, '3': null, '4': null, '5': null };
let haStreamIntervals = { main: null, '1': null, '2': null, '3': null, '4': null, '5': null };
let currentBlobUrls = { main: null, '1': null, '2': null, '3': null, '4': null, '5': null };

// --- WebRTC Player state ---
let webRtcConnections = { main: null, '1': null, '2': null, '3': null, '4': null, '5': null };
let haMessageId = 1;
let haWsCallbacks = {};

let isPaused = false;
let isAppHidden = false;
let sessionStartTime = null;
let timerInterval = null;

// --- TensorFlow.js AI State & Prediction Caching ---
let cocoModel = null;
let aiActive = true;
let aiDetectionInterval = null;
let predictionCache = { main: [], '1': [], '2': [], '3': [], '4': [], '5': [] };
let smoothPredictions = { main: [], '1': [], '2': [], '3': [], '4': [], '5': [] };
let lastPersonDetectionTime = 0;
let personDetectionBuffer = { main: 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
let activePersonDetections = { main: false, '1': false, '2': false, '3': false, '4': false, '5': false };

// --- Pixel-Based Motion State ---
let prevFrameData = { main: null, '1': null, '2': null, '3': null, '4': null, '5': null };
let motionBuffer = { main: 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
let lastMotionDetectedTime = { main: 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
let activeMotionDetections = { main: false, '1': false, '2': false, '3': false, '4': false, '5': false };


// --- Smart Focus States ---
let isSmartFocused = false;
let previousViewMode = null;
let previousSingleCh = null;
let restoreTimeout = null;
let isSmartSwapped = false;
let smartSwappedSlot = null;
let previousCamCh1 = null;
let previousCamChX = null;

// --- Initialization ---
async function init() {
	connectionStatus.textContent = "Initializing System...";

	// Fetch dynamic configuration from Main Process
	try {
		config = await ipcRenderer.invoke('get-config');
		streamPort = config.STREAM_PORT || 9999;
		console.log("Renderer loaded configuration:", config);
	} catch (e) {
		console.error("Failed to load config via IPC:", e);
	}

	// Migrate legacy numerical channel IDs ('1'..'5') to new 'rtsp_1'..'rtsp_5' format
	const migrateLegacy = (val, defaultVal) => {
		if (!val) return defaultVal;
		if (['1', '2', '3', '4', '5'].includes(val)) return `rtsp_${val}`;
		return val;
	};
	singleCh = migrateLegacy(singleCh, 'rtsp_1');
	camCh1 = migrateLegacy(camCh1, 'rtsp_1');
	camCh2 = migrateLegacy(camCh2, 'rtsp_2');
	camCh3 = migrateLegacy(camCh3, 'rtsp_3');
	camCh4 = migrateLegacy(camCh4, 'rtsp_4');
	camCh5 = migrateLegacy(camCh5, 'rtsp_5');

	localStorage.setItem('singleCh', singleCh);
	localStorage.setItem('camCh1', camCh1);
	localStorage.setItem('camCh2', camCh2);
	localStorage.setItem('camCh3', camCh3);
	localStorage.setItem('camCh4', camCh4);
	localStorage.setItem('camCh5', camCh5);

	populateAllDropdowns();

	// Set UI states of selectors
	viewModeSelect.value = viewMode;
	cameraSelect.value = singleCh;
	slots['1'].select.value = camCh1;
	slots['2'].select.value = camCh2;
	slots['3'].select.value = camCh3;
	slots['4'].select.value = camCh4;
	slots['5'].select.value = camCh5;

	updateLayout();
	updateWidgetClock();
	setInterval(updateWidgetClock, 1000);

	// Onboarding Wizard: If token is missing, show onboarding wizard
	if (!config.HA_TOKEN) {
		openOnboardingWizard();
	}

	// Wrap each critical initialization task in independent try-catch blocks to prevent UI freeze on HA connection error
	try {
		await checkHAConnection();
	} catch (e) {
		console.error("Error checking HA connection status:", e);
	}
	
	try {
		await fetchHAEntities(); // Fetch friendly labels of Home Assistant camera entities
	} catch (e) {
		console.error("Error fetching HA entities:", e);
	}
	
	try {
		connectHAWebSocket();    // Establish real-time Home Assistant events connection
	} catch (e) {
		console.error("Error initializing HA WebSocket:", e);
	}
	
	try {
		loadAIModel();           // Load TensorFlow.js background analysis
	} catch (e) {
		console.error("Error initializing AI models:", e);
	}
	
	try {
		startTimer();
	} catch (e) {
		console.error("Error starting timer:", e);
	}

	// Load streams
	try {
		refreshStreams();
	} catch (e) {
		console.error("Error starting camera streams:", e);
	}

	// Interactive Connection Status (Clicking status opens Settings Dialog directly)
	if (connectionStatus) {
		connectionStatus.style.cursor = 'pointer';
		connectionStatus.addEventListener('click', openSettingsModal);
	}
}

function populateAllDropdowns() {
	const createOpts = () => {
		let html = '<optgroup label="Local RTSP Channels">';
		for (let i = 1; i <= 5; i++) html += `<option value="rtsp_${i}">Channel ${i}</option>`;
		html += '</optgroup>';
		return html;
	};
	cameraSelect.innerHTML = createOpts(); // Single mode selector
	for (let i = 1; i <= 5; i++) {
		slots[i.toString()].select.innerHTML = createOpts();
	}
}

// --- Layout Manager ---
function updateLayout() {
	if (slotWidget) {
		slotWidget.style.display = 'none';
		slotWidget.classList.add('hidden');
	}

	// Toggle frosted-glass floating controls pill visibility in dual, triple, and quad grid modes
	const floatingPill = document.getElementById('floating-controls-pill');
	if (floatingPill) {
		if (viewMode === 'dual' || viewMode === 'triple' || viewMode === 'quad') {
			floatingPill.style.display = 'flex';
			floatingPill.classList.remove('hidden');
		} else {
			floatingPill.style.display = 'none';
			floatingPill.classList.add('hidden');
		}
	}

	// Dynamically hide bottom control bar and status bar under all multi-camera grid views
	// to maximize screen real estate and aspect ratio proportions. Keep visible in single mode.
	if (viewMode !== 'single') {
		if (controlsContainer) controlsContainer.style.display = 'none';
		if (statusBar) statusBar.style.display = 'none';
	} else {
		if (controlsContainer) controlsContainer.style.display = 'flex';
		if (statusBar) statusBar.style.display = 'block';
	}

	if (viewMode === 'single') {
		cameraSelect.style.display = 'block';
		videoContainerSingle.style.display = 'flex';
		videoContainerSingle.classList.remove('hidden');
		videoContainerGrid.style.display = 'none';
		videoContainerGrid.classList.add('hidden');
	} else {
		cameraSelect.style.display = 'none';
		videoContainerSingle.style.display = 'none';
		videoContainerSingle.classList.add('hidden');
		videoContainerGrid.style.display = 'grid';
		videoContainerGrid.classList.remove('hidden');

		// Reset container classes
		videoContainerGrid.className = 'grid-container';

		if (viewMode === 'dual') {
			videoContainerGrid.classList.add('grid-dual');
			slots['1'].el.style.display = 'block';
			slots['2'].el.style.display = 'block';
			slots['3'].el.style.display = 'none';
			slots['4'].el.style.display = 'none';
			slots['5'].el.style.display = 'none';
		} else if (viewMode === 'triple') {
			videoContainerGrid.classList.add('grid-triple');
			slots['1'].el.style.display = 'block';
			slots['2'].el.style.display = 'block';
			slots['3'].el.style.display = 'block';
			slots['4'].el.style.display = 'none';
			slots['5'].el.style.display = 'none';
		} else if (viewMode === 'quad') {
			videoContainerGrid.classList.add('grid-quad');
			slots['1'].el.style.display = 'block';
			slots['2'].el.style.display = 'block';
			slots['3'].el.style.display = 'block';
			slots['4'].el.style.display = 'block';
			slots['5'].el.style.display = 'none';
		} else if (viewMode === 'five') {
			videoContainerGrid.classList.add('grid-five');
			slots['1'].el.style.display = 'block';
			slots['2'].el.style.display = 'block';
			slots['3'].el.style.display = 'block';
			slots['4'].el.style.display = 'block';
			slots['5'].el.style.display = 'block';
			if (slotWidget) {
				slotWidget.style.display = 'block';
				slotWidget.classList.remove('hidden');
			}
		}
	}
}

// --- Symmetrical Grid Dashboard Clock/Date Updates ---
function updateWidgetClock() {
	const clockEl = document.getElementById('widget-clock');
	const dateEl = document.getElementById('widget-date');
	if (!clockEl || !dateEl) return;

	const now = new Date();
	
	// HH:MM:SS
	const hours = now.getHours().toString().padStart(2, '0');
	const minutes = now.getMinutes().toString().padStart(2, '0');
	const seconds = now.getSeconds().toString().padStart(2, '0');
	clockEl.textContent = `${hours}:${minutes}:${seconds}`;

	// e.g. "THURSDAY, MAY 21, 2026"
	const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
	const dateStr = now.toLocaleDateString('en-US', options).toUpperCase();
	dateEl.textContent = dateStr;
}

// --- WebRTC Signaling & Connection Helper ---
function sendHaWebSocketCommand(payload) {
	return new Promise((resolve, reject) => {
		if (!haSocket || haSocket.readyState !== WebSocket.OPEN) {
			return reject(new Error("Home Assistant WebSocket connection is not open."));
		}
		const id = haMessageId++;
		const msg = { id, ...payload };
		
		// 8-second timeout to avoid waiting indefinitely if server is busy or integration is broken
		const timeout = setTimeout(() => {
			if (haWsCallbacks[id]) {
				delete haWsCallbacks[id];
				reject(new Error("Home Assistant WebSocket request timeout"));
			}
		}, 8000);

		haWsCallbacks[id] = (response) => {
			clearTimeout(timeout);
			if (response.success) {
				resolve(response.result);
			} else {
				reject(new Error(response.error ? response.error.message : "Unknown WebSocket signaling error"));
			}
		};

		haSocket.send(JSON.stringify(msg));
	});
}

// --- Multi-Protocol Resource Cleanup ---
function cleanupSlotPlayers(role) {
	// 1. Destroy HLS Player
	if (hlsPlayers[role]) {
		try {
			hlsPlayers[role].destroy();
		} catch (e) {}
		hlsPlayers[role] = null;
	}
	// 2. Close WebRTC PeerConnection
	if (webRtcConnections[role]) {
		try {
			webRtcConnections[role].close();
		} catch (e) {}
		webRtcConnections[role] = null;
	}
	// 3. Reset video elements src & srcObject
	const videoEl = role === 'main' ? videoSingle : slots[role].video;
	if (videoEl) {
		try {
			videoEl.srcObject = null;
			videoEl.src = '';
		} catch (e) {}
	}
	// 4. Clear proxy/polling stream intervals
	if (haStreamIntervals[role]) {
		try {
			clearInterval(haStreamIntervals[role]);
		} catch (e) {}
		haStreamIntervals[role] = null;
	}
	// 5. Revoke active image blob URLs
	if (currentBlobUrls[role]) {
		try {
			URL.revokeObjectURL(currentBlobUrls[role]);
		} catch (e) {}
		currentBlobUrls[role] = null;
	}
	// 6. Reset image element source to release MJPEG socket connection & kill background FFmpeg process
	const imgEl = role === 'main' ? imgStreamSingle : slots[role].img;
	if (imgEl) {
		try {
			imgEl.src = '';
		} catch (e) {}
	}
}

// --- WebRTC Stream Establishment ---
async function setupWebRtcPlayer(channelId, videoElement, loaderElement, role) {
	if (loaderElement) loaderElement.classList.remove('hidden');

	// Clear slot resources to prevent stream overlay leaks
	cleanupSlotPlayers(role);

	console.log(`[WebRTC Player] Initializing WebRTC stream connection for ${role}: ${channelId}`);

	try {
		// Initialize the RTCPeerConnection with public STUN server for ICE candidate discovery
		const pc = new RTCPeerConnection({
			iceServers: [
				{ urls: 'stun:stun.l.google.com:19302' }
			]
		});
		webRtcConnections[role] = pc;

		// Track incoming stream from the camera and route to video element
		pc.ontrack = (event) => {
			console.log(`[WebRTC Player] Stream track received for ${role}`, event.streams);
			if (event.streams && event.streams[0]) {
				videoElement.srcObject = event.streams[0];
			} else {
				const stream = new MediaStream();
				stream.addTrack(event.track);
				videoElement.srcObject = stream;
			}
			videoElement.onloadedmetadata = () => {
				videoElement.play().catch(e => console.log("WebRTC autoplay blocked", e));
				if (loaderElement) loaderElement.classList.add('hidden');
			};
		};

		// Track ICE Connection state failures for HLS/polling fallback
		pc.oniceconnectionstatechange = () => {
			console.log(`[WebRTC Player] ICE Connection State for ${role}: ${pc.iceConnectionState}`);
			if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
				console.warn(`[WebRTC Player] ICE failed/closed for ${role}, dropping to fallback...`);
				fallbackToHaFallback(channelId, videoElement, loaderElement, role);
			}
		};

		// Request video & audio streams from the camera (direction: receive only)
		pc.addTransceiver('video', { direction: 'recvonly' });
		pc.addTransceiver('audio', { direction: 'recvonly' });

		// Create WebRTC Local SDP Offer
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);

		// Perform WebSocket signaling exchange
		// We try the modern camera/webrtc/offer command first, falling back to legacy camera/web_rtc_offer if needed
		let responseResult = null;
		try {
			console.log(`[WebRTC Player] Attempting modern camera/webrtc/offer signaling...`);
			responseResult = await sendHaWebSocketCommand({
				type: 'camera/webrtc/offer',
				entity_id: channelId,
				sdp: offer.sdp
			});
		} catch (modernErr) {
			console.warn(`[WebRTC Player] Modern signaling failed: ${modernErr.message}. Trying legacy camera/web_rtc_offer...`);
			responseResult = await sendHaWebSocketCommand({
				type: 'camera/web_rtc_offer',
				entity_id: channelId,
				offer: offer.sdp
			});
		}

		if (!responseResult || !responseResult.answer) {
			throw new Error("Invalid SDP signaling response from Home Assistant");
		}

		console.log(`[WebRTC Player] Signaling success! Setting remote SDP Answer description...`);
		
		// Establish the Peer-to-Peer connection by applying the SDP Answer
		await pc.setRemoteDescription(new RTCSessionDescription({
			type: 'answer',
			sdp: responseResult.answer
		}));

		console.log(`[WebRTC Player] WebRTC connection successfully negotiated for ${role}`);

	} catch (error) {
		console.warn(`[WebRTC Player] WebRTC stream negotiation failed for ${role} (${channelId}):`, error.message);
		fallbackToHaFallback(channelId, videoElement, loaderElement, role);
	}
}

// --- Home Assistant Frame Polling Fallback Setup ---
function setupHaFramePolling(channelId, videoElement, loaderElement, role) {
	let imgEl;
	if (role === 'main') {
		imgEl = imgStreamSingle;
	} else {
		imgEl = slots[role].img;
	}

	console.log(`[Proxy Fallback] Initializing HA Proxy Frame Polling for ${role}: ${channelId}`);
	
	// Hide video element, display image element
	if (videoElement) {
		videoElement.style.display = 'none';
		videoElement.classList.add('hidden');
		try {
			videoElement.pause();
			videoElement.srcObject = null;
			videoElement.src = '';
		} catch (e) {}
	}
	if (imgEl) {
		imgEl.style.display = 'block';
		imgEl.classList.remove('hidden');
	}

	// Clean up existing polling timers
	if (haStreamIntervals[role]) {
		clearInterval(haStreamIntervals[role]);
		haStreamIntervals[role] = null;
	}

	// Fetch first frame immediately
	fetchHAFrame(channelId, imgEl, loaderElement, role);

	// Start 150ms high-frequency image polling loop
	haStreamIntervals[role] = setInterval(() => {
		fetchHAFrame(channelId, imgEl, loaderElement, role);
	}, 150);
}

// Cleanly routes fallback mode
function fallbackToHaFallback(channelId, videoElement, loaderElement, role) {
	cleanupSlotPlayers(role);
	if (channelId.startsWith('camera.')) {
		setupHaFramePolling(channelId, videoElement, loaderElement, role);
	} else {
		setupHlsPlayer(channelId, videoElement, loaderElement, role);
	}
}

// --- Generic Stream Routing ---
function setupStreamSource(channelId, role) {
	let videoEl, imgEl, loaderEl;
	if (role === 'main') {
		videoEl = videoSingle;
		imgEl = imgStreamSingle;
		loaderEl = loaderSingle;
	} else {
		const slot = slots[role];
		videoEl = slot.video;
		imgEl = slot.img;
		loaderEl = slot.loader;
	}

	// Clear existing HA polling intervals for this role
	if (haStreamIntervals[role]) {
		clearInterval(haStreamIntervals[role]);
		haStreamIntervals[role] = null;
	}

	if (!channelId) {
		console.warn(`No channelId specified for role ${role}`);
		cleanupSlotPlayers(role);
		if (videoEl) {
			videoEl.style.display = 'none';
			videoEl.classList.add('hidden');
		}
		if (imgEl) {
			imgEl.style.display = 'none';
			imgEl.classList.add('hidden');
		}
		if (loaderEl) loaderEl.classList.add('hidden');
		return;
	}

	if (channelId.startsWith('camera.')) {
		// Home Assistant Camera: Hide image element, display video element, and prioritize native sub-second WebRTC
		if (imgEl) {
			imgEl.style.display = 'none';
			imgEl.classList.add('hidden');
			if (currentBlobUrls[role]) {
				URL.revokeObjectURL(currentBlobUrls[role]);
				currentBlobUrls[role] = null;
			}
		}
		if (videoEl) {
			videoEl.style.display = 'block';
			videoEl.classList.remove('hidden');
		}

		setupWebRtcPlayer(channelId, videoEl, loaderEl, role);
	} else {
		// Local RTSP stream: Hide video element, display image element, and stream zero-lag MJPEG
		cleanupSlotPlayers(role); // Clean up active HLS/WebRTC first
		
		if (videoEl) {
			videoEl.style.display = 'none';
			videoEl.classList.add('hidden');
			try {
				videoEl.pause();
				videoEl.srcObject = null;
				videoEl.src = '';
			} catch (e) {}
		}
		if (imgEl) {
			imgEl.style.display = 'block';
			imgEl.classList.remove('hidden');
			if (loaderEl) loaderEl.classList.remove('hidden');
			
			imgEl.onload = () => {
				if (loaderEl) loaderEl.classList.add('hidden');
			};
			
			// Zero-lag MJPEG stream directly from main process server
			imgEl.src = `http://localhost:${streamPort}/mjpeg?channel=${channelId}`;
		}
	}
}

async function fetchHAFrame(entityId, imgElement, loaderElement, role) {
	if (!config.HA_URL || !config.HA_TOKEN) {
		console.warn("HA credentials missing for fetchHAFrame");
		return;
	}
	
	try {
		const response = await axios.get(`${config.HA_URL}/api/camera_proxy/${entityId}`, {
			headers: { 'Authorization': `Bearer ${config.HA_TOKEN}` },
			responseType: 'blob',
			timeout: 1000 // Low timeout to prevent pile-up of slow requests
		});
		
		if (response.status === 200) {
			const blob = response.data;
			const newUrl = URL.createObjectURL(blob);
			const oldUrl = currentBlobUrls[role];
			
			// Revoke the old object URL only after the new one is loaded to prevent visual flickering
			imgElement.onload = () => {
				if (oldUrl && oldUrl !== newUrl) {
					URL.revokeObjectURL(oldUrl);
				}
				if (loaderElement) loaderElement.classList.add('hidden');
			};
			
			imgElement.src = newUrl;
			currentBlobUrls[role] = newUrl;
		}
	} catch (error) {
		console.warn(`Error fetching HA frame for ${entityId} (${role}):`, error.message);
	}
}

function setupHlsPlayer(channelId, videoElement, loaderElement, role) {
	if (loaderElement) loaderElement.classList.remove('hidden');

	// Destroy existing if valid
	if (hlsPlayers[role]) {
		hlsPlayers[role].destroy();
		hlsPlayers[role] = null;
	}

	if (!Hls.isSupported()) {
		// Fallback for native HLS (Safari)
		videoElement.src = `http://localhost:${streamPort}/stream/index_${channelId}.m3u8`;
		videoElement.onloadedmetadata = () => {
			videoElement.play().catch(e => console.log("Native autoplay blocked", e));
			if (loaderElement) loaderElement.classList.add('hidden');
		};
		return;
	}

	const configHls = {
		liveSyncDurationCount: 2,
		maxBufferLength: 8,
		enableWorker: true,
		lowLatencyMode: true,
	};

	const instance = new Hls(configHls);
	hlsPlayers[role] = instance;

	// Attach error handler immediately
	instance.on(Hls.Events.ERROR, (event, data) => {
		if (data.fatal) {
			switch (data.type) {
				case Hls.ErrorTypes.NETWORK_ERROR:
					console.log("Fatal network error encountered, trying to recover");
					instance.startLoad();
					break;
				case Hls.ErrorTypes.MEDIA_ERROR:
					console.log("Fatal media error encountered, trying to recover");
					instance.recoverMediaError();
					break;
				default:
					instance.destroy();
					hlsPlayers[role] = null;
					break;
			}
		}
	});

	const streamUrl = `http://localhost:${streamPort}/stream/index_${channelId}.m3u8`;

	pollForManifest(streamUrl, () => {
		// Verify HLS instance wasn't destroyed while polling
		if (hlsPlayers[role] !== instance) {
			instance.destroy();
			return;
		}
		instance.loadSource(streamUrl);
		instance.attachMedia(videoElement);
		instance.on(Hls.Events.MANIFEST_PARSED, () => {
			videoElement.play().catch(e => console.log("Autoplay blocked", e));
			if (loaderElement) loaderElement.classList.add('hidden'); // Hide specific loader
		});
	});
}

function pollForManifest(url, callback, attempts = 0) {
	if (attempts > 30) return; // Give up after 15 seconds
	fetch(url, { method: 'HEAD' })
		.then(res => {
			if (res.ok) callback();
			else setTimeout(() => pollForManifest(url, callback, attempts + 1), 500);
		})
		.catch(() => setTimeout(() => pollForManifest(url, callback, attempts + 1), 500));
}

// --- Active Stream Refresher ---
function refreshStreams() {
	connectionStatus.textContent = "Preparing Streams...";

	// Show loaders for active containers
	if (viewMode === 'single') {
		loaderSingle.classList.remove('hidden');
	} else {
		if (viewMode === 'dual') {
			slots['1'].loader.classList.remove('hidden');
			slots['2'].loader.classList.remove('hidden');
		} else if (viewMode === 'triple') {
			slots['1'].loader.classList.remove('hidden');
			slots['2'].loader.classList.remove('hidden');
			slots['3'].loader.classList.remove('hidden');
		} else if (viewMode === 'quad') {
			slots['1'].loader.classList.remove('hidden');
			slots['2'].loader.classList.remove('hidden');
			slots['3'].loader.classList.remove('hidden');
			slots['4'].loader.classList.remove('hidden');
		} else if (viewMode === 'five') {
			slots['1'].loader.classList.remove('hidden');
			slots['2'].loader.classList.remove('hidden');
			slots['3'].loader.classList.remove('hidden');
			slots['4'].loader.classList.remove('hidden');
			slots['5'].loader.classList.remove('hidden');
		}
	}

	// 1. Determine active channels based on mode
	let activeChannels = {};
	if (viewMode === 'single') {
		activeChannels['main'] = singleCh;
	} else if (viewMode === 'dual') {
		activeChannels['1'] = camCh1;
		activeChannels['2'] = camCh2;
	} else if (viewMode === 'triple') {
		activeChannels['1'] = camCh1;
		activeChannels['2'] = camCh2;
		activeChannels['3'] = camCh3;
	} else if (viewMode === 'quad') {
		activeChannels['1'] = camCh1;
		activeChannels['2'] = camCh2;
		activeChannels['3'] = camCh3;
		activeChannels['4'] = camCh4;
	} else if (viewMode === 'five') {
		activeChannels['1'] = camCh1;
		activeChannels['2'] = camCh2;
		activeChannels['3'] = camCh3;
		activeChannels['4'] = camCh4;
		activeChannels['5'] = camCh5;
	}

	const roles = ['main', '1', '2', '3', '4', '5'];

	// Direct zero-lag stream binding without blocking on HLS server configuration
	console.log("Direct zero-lag stream binding active channels:", activeChannels);
	roles.forEach(role => {
		if (activeChannels[role]) {
			setupStreamSource(activeChannels[role], role);
		} else {
			// Release resources completely using our unified protocol cleanup method
			cleanupSlotPlayers(role);
			// Clear inactive canvas
			const canvas = role === 'main' ? canvasSingle : slots[role].canvas;
			if (canvas) {
				const ctx = canvas.getContext('2d');
				ctx.clearRect(0, 0, canvas.width, canvas.height);
			}
			// Clear active highlights
			if (role !== 'main') {
				slots[role].el.classList.remove('motion-detected-slot');
			}
		}
	});
	connectionStatus.textContent = "Live Stream Active";
}

function jumpToLive() {
	Object.values(hlsPlayers).forEach(p => {
		if (p && p.media) {
			if (p.liveSyncPosition) {
				p.media.currentTime = p.liveSyncPosition;
			}
		}
	});
}

// Visually sync players when restored or window gets visible
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === 'visible') {
		console.log("Window visible - syncing feeds to live...");
		jumpToLive();
	}
});

ipcRenderer.on('restore-window', () => {
	console.log("Window restored via IPC - syncing feeds...");
	jumpToLive();
});

// --- Selector Change Listeners ---
viewModeSelect.addEventListener('change', (e) => {
	// If smart-focused or smart-swapped, break focus state immediately on manual switch
	if (isSmartFocused || isSmartSwapped) {
		if (isSmartSwapped) {
			const roleX = smartSwappedSlot;
			camCh1 = previousCamCh1;
			if (roleX === '2') camCh2 = previousCamChX;
			else if (roleX === '3') camCh3 = previousCamChX;
			else if (roleX === '4') camCh4 = previousCamChX;
			else if (roleX === '5') camCh5 = previousCamChX;
			
			isSmartSwapped = false;
			smartSwappedSlot = null;
		}
		isSmartFocused = false;
		if (restoreTimeout) clearTimeout(restoreTimeout);
		videoContainerSingle.classList.remove('motion-detected-slot');
		Object.values(slots).forEach(s => s.el.classList.remove('motion-detected-slot'));
	}
	viewMode = e.target.value;
	localStorage.setItem('viewMode', viewMode);
	updateLayout();
	refreshStreams();
});

cameraSelect.addEventListener('change', (e) => {
	singleCh = e.target.value;
	localStorage.setItem('singleCh', singleCh);
	refreshStreams();
});

slots['1'].select.addEventListener('change', (e) => {
	camCh1 = e.target.value;
	localStorage.setItem('camCh1', camCh1);
	refreshStreams();
});

slots['2'].select.addEventListener('change', (e) => {
	camCh2 = e.target.value;
	localStorage.setItem('camCh2', camCh2);
	refreshStreams();
});

slots['3'].select.addEventListener('change', (e) => {
	camCh3 = e.target.value;
	localStorage.setItem('camCh3', camCh3);
	refreshStreams();
});

slots['4'].select.addEventListener('change', (e) => {
	camCh4 = e.target.value;
	localStorage.setItem('camCh4', camCh4);
	refreshStreams();
});

slots['5'].select.addEventListener('change', (e) => {
	camCh5 = e.target.value;
	localStorage.setItem('camCh5', camCh5);
	refreshStreams();
});

// Bind manual click-to-swap event listeners for slots 2, 3, 4, 5
for (let i = 2; i <= 5; i++) {
	const role = i.toString();
	slots[role].el.addEventListener('click', (e) => {
		// Early return if user clicked a selector dropdown or slot header to prevent conflict
		if (e.target.closest('.slot-header') || e.target.closest('.slot-select')) return;
		
		if (viewMode === 'five' || viewMode === 'triple') {
			// Break smart focus cooldown layout restoration immediately on manual swap interaction
			isSmartFocused = false;
			if (isSmartSwapped) {
				isSmartSwapped = false;
				smartSwappedSlot = null;
			}
			if (restoreTimeout) clearTimeout(restoreTimeout);
			
			// Clear warning outlines visually
			Object.values(slots).forEach(s => s.el.classList.remove('motion-detected-slot'));
			videoContainerSingle.classList.remove('motion-detected-slot');
			
			console.log(`[Manual Swap] Instantly swapping Slot 1 with Slot ${role}`);
			
			// Perform swapping
			const temp = camCh1;
			if (role === '2') { camCh1 = camCh2; camCh2 = temp; }
			else if (role === '3') { camCh1 = camCh3; camCh3 = temp; }
			else if (role === '4') { camCh1 = camCh4; camCh4 = temp; }
			else if (role === '5') { camCh1 = camCh5; camCh5 = temp; }
			
			// Save swapped mappings back to LocalStorage persistence
			localStorage.setItem('camCh1', camCh1);
			localStorage.setItem('camCh' + role, temp);
			
			// Synchronize drop-down values
			slots['1'].select.value = camCh1;
			slots[role].select.value = temp;
			
			// Rebuild streaming connections
			refreshStreams();
			
			showToastNotification('Camera Swapped', 'The camera was swapped with the main screen.', 'ðŸ”„');
		}
	});
}

// Play/Pause Video Controls
playPauseBtn.addEventListener('click', () => {
	isPaused = !isPaused;
	const videos = [videoSingle, slots['1'].video, slots['2'].video, slots['3'].video, slots['4'].video, slots['5'].video];
	videos.forEach(v => {
		if (v) {
			isPaused ? v.pause() : v.play().catch(e => {});
		}
	});

	if (isPaused) {
		playPauseBtn.innerHTML = '<span class="icon">â–¶</span>';
		liveBadge.textContent = "PAUSED";
		liveBadge.style.backgroundColor = "#555";
	} else {
		jumpToLive();
		playPauseBtn.innerHTML = '<span class="icon">â¸</span>';
		liveBadge.textContent = "LIVE";
		liveBadge.style.backgroundColor = "#ef4444";
	}
});

closeBtn.addEventListener('click', () => window.close());
document.getElementById('minimize-btn').addEventListener('click', () => ipcRenderer.send('minimize-window'));

if (doorOuterBtn) doorOuterBtn.addEventListener('click', (e) => openDoor(config.DOOR_OUTER_ENTITY || 'switch.outer_door', e.currentTarget));
if (doorInnerBtn) doorInnerBtn.addEventListener('click', (e) => openDoor(config.DOOR_INNER_ENTITY || 'switch.inner_door', e.currentTarget));

if (widgetUnlockOuter) widgetUnlockOuter.addEventListener('click', (e) => openDoor(config.DOOR_OUTER_ENTITY || 'switch.outer_door', e.currentTarget));
if (widgetUnlockInner) widgetUnlockInner.addEventListener('click', (e) => openDoor(config.DOOR_INNER_ENTITY || 'switch.inner_door', e.currentTarget));

// Window Drag Header Quick Actions
const headerUnlockOuter = document.getElementById('header-unlock-outer');
const headerUnlockInner = document.getElementById('header-unlock-inner');
if (headerUnlockOuter) headerUnlockOuter.addEventListener('click', (e) => openDoor(config.DOOR_OUTER_ENTITY || 'switch.outer_door', e.currentTarget));
if (headerUnlockInner) headerUnlockInner.addEventListener('click', (e) => openDoor(config.DOOR_INNER_ENTITY || 'switch.inner_door', e.currentTarget));

// --- Voice Wave Intercom Controls ---
let isTalking = false;
if (talkBtn) {
	talkBtn.addEventListener('click', () => {
		isTalking = !isTalking;
		if (isTalking) {
			if (talkBtnText) talkBtnText.textContent = 'Stop Talking';
			talkBtn.classList.add('btn-secondary');
			if (talkWave) {
				talkWave.classList.remove('hidden');
				talkWave.style.display = 'flex';
			}
		} else {
			if (talkBtnText) talkBtnText.textContent = 'Talk';
			talkBtn.classList.remove('btn-secondary');
			if (talkWave) {
				talkWave.classList.add('hidden');
				talkWave.style.display = 'none';
			}
		}
	});
}

// --- Glassmorphic In-App Toast & Audio Chime Entegrasyonu ---
let toastTimeout = null;

function showToastNotification(title, bodyText, icon = 'ðŸ””') {
	if (toastTimeout) {
		clearTimeout(toastTimeout);
	}
	
	toastIcon.textContent = icon;
	toastTitle.textContent = title;
	toastBody.textContent = bodyText;
	
	toastContainer.classList.add('show');
	playAudioChime(); // Play pleasant synthetic dual-tone chime
	
	toastTimeout = setTimeout(() => {
		toastContainer.classList.remove('show');
	}, 6000); // Auto-dismiss after 6 seconds
}

if (toastClose) {
	toastClose.addEventListener('click', (e) => {
		e.stopPropagation();
		toastContainer.classList.remove('show');
	});
}

if (toastBanner) {
	toastBanner.addEventListener('click', () => {
		toastContainer.classList.remove('show');
		ipcRenderer.send('restore-window'); // Restore window if minimized
	});
}

// Synthesize pleasant, professional dual-note chime (D5 followed by A5) via Web Audio API
function playAudioChime() {
	try {
		const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
		if (!AudioCtxClass) return;
		const ctx = new AudioCtxClass();
		
		// First Note: D5 (587.33Hz) sine wave chime
		const osc1 = ctx.createOscillator();
		const gain1 = ctx.createGain();
		
		osc1.type = 'sine';
		osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
		gain1.gain.setValueAtTime(0.12, ctx.currentTime);
		gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
		
		osc1.connect(gain1);
		gain1.connect(ctx.destination);
		osc1.start();
		osc1.stop(ctx.currentTime + 0.6);
		
		// Second Note: A5 (880.00Hz) sine wave chime, delayed by 150ms
		setTimeout(() => {
			try {
				const osc2 = ctx.createOscillator();
				const gain2 = ctx.createGain();
				
				osc2.type = 'sine';
				osc2.frequency.setValueAtTime(880.00, ctx.currentTime);
				gain2.gain.setValueAtTime(0.10, ctx.currentTime);
				gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
				
				osc2.connect(gain2);
				gain2.connect(ctx.destination);
				osc2.start();
				osc2.stop(ctx.currentTime + 0.8);
			} catch(e){}
		}, 150);
		
	} catch (e) {
		console.warn("Web Audio chime synthesizer failed:", e);
	}
}

// --- IPC Notification Hooks ---
ipcRenderer.on('doorbell-ring', () => {
	connectionStatus.textContent = `Doorbell Rang!`;
	showToastNotification('Doorbell Ringing!', 'The doorbell was triggered. Click to view the live feed.', 'ðŸ””');
	setTimeout(jumpToLive, 500);
});

ipcRenderer.on('person-detected-event', () => {
	showToastNotification('Motion Detected!', 'Someone was detected at the door!', 'ðŸƒ');
	setTimeout(jumpToLive, 500);
});

// --- Dynamic Settings Modal Entegrasyonu ---
// Bind settings dialog opening to all instances of duplicate settings gear buttons
const settingsBtn = {
	addEventListener(event, callback) {
		document.querySelectorAll('.settings-btn').forEach(btn => {
			btn.addEventListener(event, callback);
		});
	}
};
const settingsModal = document.getElementById('settings-modal');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsRadios = document.getElementsByName('doorbell-action');
const testDoorbellBtn = document.getElementById('test-doorbell-btn');

let currentWizardStep = 1;

async function openOnboardingWizard() {
	currentWizardStep = 1;
	
	// Prefill inputs
	document.getElementById('wizard-ha-url').value = config.HA_URL || '';
	const wizardTokenEl = document.getElementById('wizard-ha-token');
	if (wizardTokenEl) {
		wizardTokenEl.value = config.HA_TOKEN || '';
		wizardTokenEl.type = 'password';
	}
	const toggleWizardTokenBtnEl = document.getElementById('toggle-wizard-token-visibility');
	if (toggleWizardTokenBtnEl) {
		toggleWizardTokenBtnEl.textContent = '👁️';
	}
	document.getElementById('wizard-rtsp-url').value = config.RTSP_URL || '';
	
	// Prefill radios
	const wizardRadios = document.getElementsByName('wizard-doorbell-action');
	wizardRadios.forEach(r => {
		r.checked = (r.value === config.DOORBELL_ACTION);
	});
	
	// Prefill AI slider
	if (wizardAiSlider && wizardAiSliderVal) {
		const sens = Math.round((config.AI_SENSITIVITY !== undefined ? config.AI_SENSITIVITY : 0.55) * 100);
		wizardAiSlider.value = sens;
		wizardAiSliderVal.textContent = '%' + sens;
	}
	
	// Prefill AI size
	const wizardAiMinSize = document.getElementById('wizard-ai-min-size');
	if (wizardAiMinSize) {
		wizardAiMinSize.value = (config.AI_MIN_BOX_SIZE !== undefined ? config.AI_MIN_BOX_SIZE : 0.04).toString();
	}
	
	// Populate Display Selector
	try {
		const displays = await ipcRenderer.invoke('get-displays');
		if (wizardDisplaySelect) {
			wizardDisplaySelect.innerHTML = displays.map(d => 
				`<option value="${d.id}" ${d.id === config.DISPLAY_ID ? 'selected' : ''}>${d.label} ${d.isPrimary ? '(Primary)' : ''}</option>`
			).join('');
		}
	} catch (e) {
		console.error("Wizard failed to fetch displays:", e);
	}
	
	updateWizardUI();
	if (onboardingWizard) {
		onboardingWizard.classList.remove('hidden');
	}
}

function updateWizardUI() {
	// Show active step, hide others
	for (let i = 1; i <= 3; i++) {
		const stepEl = document.getElementById(`wizard-step-${i}`);
		if (stepEl) {
			if (i === currentWizardStep) {
				stepEl.classList.remove('hidden');
			} else {
				stepEl.classList.add('hidden');
			}
		}
		
		// Update dots
		const dotEl = document.querySelector(`.step-dot[data-step="${i}"]`);
		if (dotEl) {
			if (i === currentWizardStep) {
				dotEl.classList.add('active');
			} else {
				dotEl.classList.remove('active');
			}
		}
	}
	
	// Manage buttons
	if (currentWizardStep === 1) {
		wizardPrevBtn.classList.add('hidden');
		wizardNextBtn.classList.remove('hidden');
		wizardFinishBtn.classList.add('hidden');
	} else if (currentWizardStep === 2) {
		wizardPrevBtn.classList.remove('hidden');
		wizardNextBtn.classList.remove('hidden');
		wizardFinishBtn.classList.add('hidden');
	} else if (currentWizardStep === 3) {
		wizardPrevBtn.classList.remove('hidden');
		wizardNextBtn.classList.add('hidden');
		wizardFinishBtn.classList.remove('hidden');
	}
}

async function openSettingsModal() {
	document.getElementById('ha-url-input').value = config.HA_URL || '';
	const settingsTokenEl = document.getElementById('ha-token-input');
	if (settingsTokenEl) {
		settingsTokenEl.value = config.HA_TOKEN || '';
		settingsTokenEl.type = 'password';
	}
	const toggleSettingsTokenBtnEl = document.getElementById('toggle-settings-token-visibility');
	if (toggleSettingsTokenBtnEl) {
		toggleSettingsTokenBtnEl.textContent = '👁️';
	}
	document.getElementById('rtsp-url-input').value = config.RTSP_URL || '';
	
	// Populate individual camera URLs
	for (let i = 1; i <= 5; i++) {
		const inputEl = document.getElementById(`rtsp-url-${i}-input`);
		if (inputEl) {
			inputEl.value = config[`RTSP_URL_${i}`] || '';
		}
	}
	
	// Reset Collapsible individual RTSP URLs container
	const container = document.getElementById('individual-rtsp-container');
	if (container) {
		container.style.maxHeight = '0px';
	}
	const arrow = document.getElementById('individual-rtsp-arrow');
	if (arrow) {
		arrow.style.transform = 'rotate(0deg)';
	}
	
	settingsRadios.forEach(r => {
		r.checked = (r.value === config.DOORBELL_ACTION);
	});
	
	document.getElementById('doorbell-entity-input').value = config.DOORBELL_ENTITY || '';
	document.getElementById('door-outer-entity-input').value = config.DOOR_OUTER_ENTITY || '';
	document.getElementById('door-inner-entity-input').value = config.DOOR_INNER_ENTITY || '';
	
	// Load AI parameters into Modal UI
	const slider = document.getElementById('ai-sensitivity-input');
	const valSpan = document.getElementById('ai-sensitivity-val');
	if (slider && valSpan) {
		const sens = Math.round((config.AI_SENSITIVITY !== undefined ? config.AI_SENSITIVITY : 0.55) * 100);
		slider.value = sens;
		valSpan.textContent = '%' + sens;
	}
	const sizeSelect = document.getElementById('ai-min-size-select');
	if (sizeSelect) {
		sizeSelect.value = (config.AI_MIN_BOX_SIZE !== undefined ? config.AI_MIN_BOX_SIZE : 0.04).toString();
	}
	
	try {
		const displays = await ipcRenderer.invoke('get-displays');
		const displaySelect = document.getElementById('display-select');
		if (displaySelect) {
			displaySelect.innerHTML = displays.map(d => 
				`<option value="${d.id}" ${d.id === config.DISPLAY_ID ? 'selected' : ''}>${d.label} ${d.isPrimary ? '(Primary)' : ''}</option>`
			).join('');
		}
	} catch (e) {
		console.error("Failed to fetch target system displays:", e);
	}
	
	settingsModal.classList.remove('hidden');
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);

const closeSettingsBtn = document.getElementById('close-settings-btn');
if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

// Bind Toggle Individual RTSP URL settings panel click handler
const toggleIndividualRtspBtn = document.getElementById('toggle-individual-rtsp-btn');
if (toggleIndividualRtspBtn) {
	toggleIndividualRtspBtn.addEventListener('click', () => {
		const container = document.getElementById('individual-rtsp-container');
		const arrow = document.getElementById('individual-rtsp-arrow');
		if (container) {
			if (container.style.maxHeight === '0px' || !container.style.maxHeight) {
				container.style.maxHeight = '420px'; // Plenty of height for the 5 child fields
				if (arrow) arrow.style.transform = 'rotate(180deg)';
			} else {
				container.style.maxHeight = '0px';
				if (arrow) arrow.style.transform = 'rotate(0deg)';
			}
		}
	});
}

const aiSlider = document.getElementById('ai-sensitivity-input');
const aiSliderVal = document.getElementById('ai-sensitivity-val');
if (aiSlider && aiSliderVal) {
	aiSlider.addEventListener('input', (e) => {
		aiSliderVal.textContent = '%' + e.target.value;
	});
}

// --- Onboarding Wizard Event Listeners ---
if (wizardAiSlider && wizardAiSliderVal) {
	wizardAiSlider.addEventListener('input', (e) => {
		wizardAiSliderVal.textContent = '%' + e.target.value;
	});
}

// --- Long-Lived Access Token Visibility & Copying Handlers ---
const wizardTokenInput = document.getElementById('wizard-ha-token');
const toggleWizardTokenBtn = document.getElementById('toggle-wizard-token-visibility');
const copyWizardTokenBtn = document.getElementById('copy-wizard-token');

if (wizardTokenInput && toggleWizardTokenBtn) {
	toggleWizardTokenBtn.addEventListener('click', () => {
		if (wizardTokenInput.type === 'password') {
			wizardTokenInput.type = 'text';
			toggleWizardTokenBtn.textContent = '🔒';
		} else {
			wizardTokenInput.type = 'password';
			toggleWizardTokenBtn.textContent = '👁️';
		}
	});
}

if (wizardTokenInput && copyWizardTokenBtn) {
	copyWizardTokenBtn.addEventListener('click', async () => {
		const token = wizardTokenInput.value.trim();
		if (!token) {
			showToastNotification('Warning', 'Token field is empty', '⚠️');
			return;
		}
		try {
			await navigator.clipboard.writeText(token);
			showToastNotification('Success', 'Token copied to clipboard!', '📋');
		} catch (err) {
			console.error('Failed to copy token:', err);
			showToastNotification('Error', 'Failed to copy. Please select and copy manually.', '❌');
		}
	});
}

const settingsTokenInput = document.getElementById('ha-token-input');
const toggleSettingsTokenBtn = document.getElementById('toggle-settings-token-visibility');
const copySettingsTokenBtn = document.getElementById('copy-settings-token');

if (settingsTokenInput && toggleSettingsTokenBtn) {
	toggleSettingsTokenBtn.addEventListener('click', () => {
		if (settingsTokenInput.type === 'password') {
			settingsTokenInput.type = 'text';
			toggleSettingsTokenBtn.textContent = '🔒';
		} else {
			settingsTokenInput.type = 'password';
			toggleSettingsTokenBtn.textContent = '👁️';
		}
	});
}

if (settingsTokenInput && copySettingsTokenBtn) {
	copySettingsTokenBtn.addEventListener('click', async () => {
		const token = settingsTokenInput.value.trim();
		if (!token) {
			showToastNotification('Warning', 'Token field is empty', '⚠️');
			return;
		}
		try {
			await navigator.clipboard.writeText(token);
			showToastNotification('Success', 'Token copied to clipboard!', '📋');
		} catch (err) {
			console.error('Failed to copy token:', err);
			showToastNotification('Error', 'Failed to copy. Please select and copy manually.', '❌');
		}
	});
}

if (wizardPrevBtn) {
	wizardPrevBtn.addEventListener('click', () => {
		if (currentWizardStep > 1) {
			currentWizardStep--;
			updateWizardUI();
		}
	});
}

if (wizardNextBtn) {
	wizardNextBtn.addEventListener('click', () => {
		if (currentWizardStep < 3) {
			currentWizardStep++;
			updateWizardUI();
		}
	});
}

if (wizardFinishBtn) {
	wizardFinishBtn.addEventListener('click', async () => {
		const haUrl = document.getElementById('wizard-ha-url').value.trim() || 'http://ev.local:8123';
		const haToken = document.getElementById('wizard-ha-token').value.trim();
		const rtspUrl = document.getElementById('wizard-rtsp-url').value.trim();
		
		let selectedAction = 'open';
		const wizardRadios = document.getElementsByName('wizard-doorbell-action');
		wizardRadios.forEach(r => { if (r.checked) selectedAction = r.value; });
		
		const displayId = wizardDisplaySelect ? parseInt(wizardDisplaySelect.value) : 0;
		const sliderVal = wizardAiSlider ? parseFloat(wizardAiSlider.value) / 100 : 0.55;
		const sizeVal = document.getElementById('wizard-ai-min-size') ? parseFloat(document.getElementById('wizard-ai-min-size').value) : 0.04;
		
		const newConfig = {
			HA_URL: haUrl,
			HA_TOKEN: haToken,
			RTSP_URL: rtspUrl,
			DISPLAY_ID: displayId,
			DOORBELL_ACTION: selectedAction,
			AI_SENSITIVITY: sliderVal,
			AI_MIN_BOX_SIZE: sizeVal
		};
		
		const oldHaUrl = config.HA_URL;
		const oldHaToken = config.HA_TOKEN;
		
		try {
			config = await ipcRenderer.invoke('save-config', newConfig);
			streamPort = config.STREAM_PORT || 9999;
			console.log("Wizard: Configuration written successfully:", config);
		} catch (e) {
			console.error("Wizard: Failed to write new config:", e);
		}
		
		if (onboardingWizard) {
			onboardingWizard.classList.add('hidden');
		}
		
		// Recalculate HA and camera connections
		connectionStatus.textContent = "Updating Connection...";
		await checkHAConnection();
		await fetchHAEntities();
		connectHAWebSocket();
		refreshStreams();
	});
}

if (testDoorbellBtn) {
	testDoorbellBtn.addEventListener('click', () => ipcRenderer.send('test-doorbell'));
}

if (saveSettingsBtn) {
	saveSettingsBtn.addEventListener('click', async () => {
		const haUrl = document.getElementById('ha-url-input').value.trim() || 'http://ev.local:8123';
		const haToken = document.getElementById('ha-token-input').value.trim();
		const rtspUrl = document.getElementById('rtsp-url-input').value.trim();
		
		// Read specific channel URLs from UI
		const rtspUrl1 = document.getElementById('rtsp-url-1-input').value.trim();
		const rtspUrl2 = document.getElementById('rtsp-url-2-input').value.trim();
		const rtspUrl3 = document.getElementById('rtsp-url-3-input').value.trim();
		const rtspUrl4 = document.getElementById('rtsp-url-4-input').value.trim();
		const rtspUrl5 = document.getElementById('rtsp-url-5-input').value.trim();
		
		const doorbellEntityInput = document.getElementById('doorbell-entity-input').value.trim() || 'binary_sensor.doorbell';
		const doorOuterEntityInput = document.getElementById('door-outer-entity-input').value.trim() || 'switch.outer_door';
		const doorInnerEntityInput = document.getElementById('door-inner-entity-input').value.trim() || 'switch.inner_door';
		
		let selectedAction = 'open';
		settingsRadios.forEach(r => { if (r.checked) selectedAction = r.value; });
		
		const displaySelect = document.getElementById('display-select');
		const displayId = displaySelect ? parseInt(displaySelect.value) : 0;
		
		// Read AI parameters from UI
		const sliderVal = document.getElementById('ai-sensitivity-input') ? parseFloat(document.getElementById('ai-sensitivity-input').value) / 100 : 0.55;
		const sizeVal = document.getElementById('ai-min-size-select') ? parseFloat(document.getElementById('ai-min-size-select').value) : 0.04;
		
		const newConfig = {
			HA_URL: haUrl,
			HA_TOKEN: haToken,
			RTSP_URL: rtspUrl,
			RTSP_URL_1: rtspUrl1,
			RTSP_URL_2: rtspUrl2,
			RTSP_URL_3: rtspUrl3,
			RTSP_URL_4: rtspUrl4,
			RTSP_URL_5: rtspUrl5,
			DISPLAY_ID: displayId,
			DOORBELL_ENTITY: doorbellEntityInput,
			DOOR_OUTER_ENTITY: doorOuterEntityInput,
			DOOR_INNER_ENTITY: doorInnerEntityInput,
			DOORBELL_ACTION: selectedAction,
			AI_SENSITIVITY: sliderVal,
			AI_MIN_BOX_SIZE: sizeVal
		};
		
		const oldHaUrl = config.HA_URL;
		const oldHaToken = config.HA_TOKEN;
		const oldDoorbellEntity = config.DOORBELL_ENTITY;
		
		try {
			config = await ipcRenderer.invoke('save-config', newConfig);
			streamPort = config.STREAM_PORT || 9999;
			console.log("Configuration written successfully:", config);
		} catch (e) {
			console.error("Failed to write new config:", e);
		}
		
		settingsModal.classList.add('hidden');
		
		if (haUrl !== oldHaUrl || haToken !== oldHaToken || doorbellEntityInput !== oldDoorbellEntity) {
			connectionStatus.textContent = "Updating Connection...";
			await checkHAConnection();
			await fetchHAEntities();
			connectHAWebSocket();
		}
	});
}

// --- RustDesk-Style Encrypted Settings Sharing (XOR Cipher in Base64) ---
const CIPHER_KEY = 'kg_secret_cipher_key_2026';

function customEncrypt(text, key) {
	let result = '';
	for (let i = 0; i < text.length; i++) {
		const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
		result += String.fromCharCode(charCode);
	}
	try {
		return btoa(unescape(encodeURIComponent(result)));
	} catch (e) {
		return Buffer.from(result, 'binary').toString('base64');
	}
}

function customDecrypt(base64Text, key) {
	try {
		let decodedBinary = '';
		try {
			decodedBinary = decodeURIComponent(escape(atob(base64Text)));
		} catch (e) {
			decodedBinary = Buffer.from(base64Text, 'base64').toString('binary');
		}
		let result = '';
		for (let i = 0; i < decodedBinary.length; i++) {
			const charCode = decodedBinary.charCodeAt(i) ^ key.charCodeAt(i % key.length);
			result += String.fromCharCode(charCode);
		}
		return result;
	} catch (e) {
		throw new Error("Invalid encrypted data structure.");
	}
}

// Bind Export Settings Click Handler
const exportSettingsBtn = document.getElementById('export-settings-btn');
if (exportSettingsBtn) {
	exportSettingsBtn.addEventListener('click', () => {
		try {
			const haUrl = document.getElementById('ha-url-input').value.trim();
			const haToken = document.getElementById('ha-token-input').value.trim();
			const rtspUrl = document.getElementById('rtsp-url-input').value.trim();
			
			const rtspUrl1 = document.getElementById('rtsp-url-1-input').value.trim();
			const rtspUrl2 = document.getElementById('rtsp-url-2-input').value.trim();
			const rtspUrl3 = document.getElementById('rtsp-url-3-input').value.trim();
			const rtspUrl4 = document.getElementById('rtsp-url-4-input').value.trim();
			const rtspUrl5 = document.getElementById('rtsp-url-5-input').value.trim();
			
			const doorbellEntity = document.getElementById('doorbell-entity-input').value.trim();
			const doorOuterEntity = document.getElementById('door-outer-entity-input').value.trim();
			const doorInnerEntity = document.getElementById('door-inner-entity-input').value.trim();
			
			let doorbellAction = 'open';
			const radios = document.getElementsByName('doorbell-action');
			radios.forEach(r => { if (r.checked) doorbellAction = r.value; });
			
			const displaySelect = document.getElementById('display-select');
			const displayId = displaySelect ? parseInt(displaySelect.value) : 0;
			
			const slider = document.getElementById('ai-sensitivity-input');
			const aiSensitivity = slider ? parseFloat(slider.value) / 100 : 0.55;
			
			const sizeSelect = document.getElementById('ai-min-size-select');
			const aiMinBoxSize = sizeSelect ? parseFloat(sizeSelect.value) : 0.04;

			const payload = {
				config: {
					HA_URL: haUrl,
					HA_TOKEN: haToken,
					RTSP_URL: rtspUrl,
					RTSP_URL_1: rtspUrl1,
					RTSP_URL_2: rtspUrl2,
					RTSP_URL_3: rtspUrl3,
					RTSP_URL_4: rtspUrl4,
					RTSP_URL_5: rtspUrl5,
					DOORBELL_ENTITY: doorbellEntity,
					DOOR_OUTER_ENTITY: doorOuterEntity,
					DOOR_INNER_ENTITY: doorInnerEntity,
					DOORBELL_ACTION: doorbellAction,
					DISPLAY_ID: displayId,
					AI_SENSITIVITY: aiSensitivity,
					AI_MIN_BOX_SIZE: aiMinBoxSize
				},
				localStorage: {
					singleCh: localStorage.getItem('singleCh') || 'rtsp_1',
					camCh1: localStorage.getItem('camCh1') || 'rtsp_1',
					camCh2: localStorage.getItem('camCh2') || 'rtsp_2',
					camCh3: localStorage.getItem('camCh3') || 'rtsp_3',
					camCh4: localStorage.getItem('camCh4') || 'rtsp_4',
					camCh5: localStorage.getItem('camCh5') || 'rtsp_5',
					viewMode: localStorage.getItem('viewMode') || 'single'
				}
			};

			const jsonStr = JSON.stringify(payload);
			const encrypted = customEncrypt(jsonStr, CIPHER_KEY);
			
			navigator.clipboard.writeText(encrypted).then(() => {
				showToastNotification('Settings Copied', 'Your encrypted settings have been successfully copied to the clipboard.', 'ðŸ“¤');
			}).catch(err => {
				console.error("Clipboard copy error:", err);
				alert("Failed to copy settings: " + err.message);
			});
		} catch (e) {
			console.error("Export error:", e);
			showToastNotification('Export Error', e.message, 'âš ï¸');
		}
	});
}

// Bind Import Settings Click Handler
const importSettingsBtn = document.getElementById('import-settings-btn');
if (importSettingsBtn) {
	importSettingsBtn.addEventListener('click', async () => {
		try {
			const clipboardText = await navigator.clipboard.readText();
			if (!clipboardText) {
				showToastNotification('Clipboard Empty', 'No clipboard data found to paste.', 'âš ï¸');
				return;
			}
			
			const decrypted = customDecrypt(clipboardText.trim(), CIPHER_KEY);
			const data = JSON.parse(decrypted);
			
			if (!data || !data.config || !data.localStorage) {
				throw new Error("Invalid data structure or incorrect key.");
			}
			
			// Update config via IPC
			config = await ipcRenderer.invoke('save-config', data.config);
			
			// Update localStorage
			for (const [key, value] of Object.entries(data.localStorage)) {
				localStorage.setItem(key, value);
			}
			
			// Update current runtime state variables
			viewMode = data.localStorage.viewMode || 'single';
			singleCh = data.localStorage.singleCh || 'rtsp_1';
			camCh1 = data.localStorage.camCh1 || 'rtsp_1';
			camCh2 = data.localStorage.camCh2 || 'rtsp_2';
			camCh3 = data.localStorage.camCh3 || 'rtsp_3';
			camCh4 = data.localStorage.camCh4 || 'rtsp_4';
			camCh5 = data.localStorage.camCh5 || 'rtsp_5';
			
			// Refresh UI elements
			document.getElementById('ha-url-input').value = config.HA_URL || '';
			document.getElementById('ha-token-input').value = config.HA_TOKEN || '';
			document.getElementById('rtsp-url-input').value = config.RTSP_URL || '';
			
			// Refresh individual camera URLs
			for (let i = 1; i <= 5; i++) {
				const inputEl = document.getElementById(`rtsp-url-${i}-input`);
				if (inputEl) {
					inputEl.value = config[`RTSP_URL_${i}`] || '';
				}
			}
			
			document.getElementById('doorbell-entity-input').value = config.DOORBELL_ENTITY || '';
			document.getElementById('door-outer-entity-input').value = config.DOOR_OUTER_ENTITY || '';
			document.getElementById('door-inner-entity-input').value = config.DOOR_INNER_ENTITY || '';
			
			const radios = document.getElementsByName('doorbell-action');
			radios.forEach(r => { r.checked = (r.value === config.DOORBELL_ACTION); });
			
			const slider = document.getElementById('ai-sensitivity-input');
			const valSpan = document.getElementById('ai-sensitivity-val');
			if (slider && valSpan) {
				const sens = Math.round((config.AI_SENSITIVITY !== undefined ? config.AI_SENSITIVITY : 0.55) * 100);
				slider.value = sens;
				valSpan.textContent = '%' + sens;
			}
			const sizeSelect = document.getElementById('ai-min-size-select');
			if (sizeSelect) {
				sizeSelect.value = (config.AI_MIN_BOX_SIZE !== undefined ? config.AI_MIN_BOX_SIZE : 0.04).toString();
			}
			
			// Populate displays and select imported display id
			try {
				const displays = await ipcRenderer.invoke('get-displays');
				const displaySelect = document.getElementById('display-select');
				if (displaySelect) {
					displaySelect.innerHTML = displays.map(d => 
						`<option value="${d.id}" ${d.id === config.DISPLAY_ID ? 'selected' : ''}>${d.label} ${d.isPrimary ? '(Primary)' : ''}</option>`
					).join('');
				}
			} catch (e) {
				console.error("Display refresh in import failed:", e);
			}
			
			// Sync main drop-downs
			viewModeSelect.value = viewMode;
			cameraSelect.value = singleCh;
			slots['1'].select.value = camCh1;
			slots['2'].select.value = camCh2;
			slots['3'].select.value = camCh3;
			slots['4'].select.value = camCh4;
			slots['5'].select.value = camCh5;
			
			// Close modal
			settingsModal.classList.add('hidden');
			
			// Trigger UI/Connection layout and refresh streams
			updateLayout();
			connectionStatus.textContent = "Updating Connection...";
			await checkHAConnection();
			await fetchHAEntities();
			connectHAWebSocket();
			refreshStreams();
			
			showToastNotification('Settings Imported', 'All settings and channel matches have been successfully imported from the clipboard!', 'ðŸ“¥');
		} catch (e) {
			console.error("Import error:", e);
			showToastNotification('Import Error', 'Failed to decrypt data. Please make sure you have copied valid encrypted settings.', 'âš ï¸');
		}
	});
}

// --- Home Assistant websocket status ---
async function checkHAConnection() {
	if (!config.HA_URL || !config.HA_TOKEN) {
		connectionStatus.textContent = "No HA Connection (Token Missing)";
		return;
	}
	try {
		const res = await axios.get(`${config.HA_URL}/api/`, { headers: { 'Authorization': `Bearer ${config.HA_TOKEN}` }, timeout: 2000 });
		if (res.status === 200) connectionStatus.textContent = "HA Connection Successful";
	} catch (e) { connectionStatus.textContent = "HA Connection Error"; }
}

function connectHAWebSocket() {
	if (haSocket) {
		try { haSocket.close(); } catch (e) {}
		haSocket = null;
	}

	if (!config.HA_URL || !config.HA_TOKEN) {
		console.warn("HA parameters missing. Skipping WebSocket initialization.");
		return;
	}

	let wsUrl = config.HA_URL.replace(/^http/, 'ws');
	if (!wsUrl.endsWith('/api/websocket')) {
		wsUrl = wsUrl.replace(/\/$/, '') + '/api/websocket';
	}

	console.log(`Connecting HA WebSocket: ${wsUrl}`);
	haSocket = new WebSocket(wsUrl);

	let authenticated = false;

	haSocket.onopen = () => console.log("HA WebSocket connected successfully!");

	haSocket.onmessage = (event) => {
		let msg;
		try {
			msg = JSON.parse(event.data);
		} catch (e) {
			console.error("Failed to parse WebSocket message:", event.data);
			return;
		}

		// Handle Home Assistant ping/pong to keep WebSocket alive
		if (msg.type === 'ping') {
			try {
				haSocket.send(JSON.stringify({
					type: 'pong',
					id: msg.id
				}));
			} catch (err) {
				console.error("Failed to send pong response:", err);
			}
			return;
		}

		if (msg.type === 'auth_required') {
			haSocket.send(JSON.stringify({
				type: 'auth',
				access_token: config.HA_TOKEN
			}));
		} else if (msg.type === 'auth_ok') {
			authenticated = true;
			// Subscribe to state_changed events using the global message counter
			const subMsg = {
				id: haMessageId++,
				type: 'subscribe_events',
				event_type: 'state_changed'
			};
			haSocket.send(JSON.stringify(subMsg));
			
			// Also subscribe to custom cam_monitor_event triggers (generalized triggers independent of local PC IPs)
			const customSubMsg = {
				id: haMessageId++,
				type: 'subscribe_events',
				event_type: 'cam_monitor_event'
			};
			haSocket.send(JSON.stringify(customSubMsg));
			console.log(`Subscribed state_changed events and custom cam_monitor_event triggers.`);
		} else if (msg.type === 'auth_invalid') {
			console.error("WebSocket auth token rejected.");
			connectionStatus.textContent = "HA Authorization Error!";
		} else if (msg.type === 'event') {
			const eventData = msg.event;
			if (eventData) {
				if (eventData.event_type === 'state_changed') {
					const data = eventData.data;
					if (data && data.entity_id === config.DOORBELL_ENTITY) {
						const oldState = data.old_state ? data.old_state.state : null;
						const newState = data.new_state ? data.new_state.state : null;
						console.log(`[WebSocket HA Event] ${config.DOORBELL_ENTITY} state: ${oldState} -> ${newState}`);
						
						if (newState === 'on' && oldState !== 'on') {
							console.log("Doorbell state is ON. Triggering chime/window popup!");
							ipcRenderer.send('trigger-event', 'doorbell');
						}
					}
				} else if (eventData.event_type === 'cam_monitor_event') {
					const data = eventData.data;
					if (data && data.type === 'doorbell') {
						console.log("[WebSocket Custom Event] cam_monitor_event doorbell triggered!");
						ipcRenderer.send('trigger-event', 'doorbell');
					}
				}
			}
		} else if (msg.type === 'result') {
			// Handle SDP offer / answer responses or other HA WebSocket commands
			const id = msg.id;
			if (haWsCallbacks[id]) {
				haWsCallbacks[id](msg);
				delete haWsCallbacks[id];
			}
		}
	};

	haSocket.onclose = (event) => {
		console.warn(`WebSocket closed (Code: ${event.code}). Auto-reconnect in 5s...`);
		authenticated = false;
		// Reject any pending callbacks since the connection is closed
		Object.keys(haWsCallbacks).forEach(id => {
			if (haWsCallbacks[id]) {
				haWsCallbacks[id]({ success: false, error: { message: "HA WebSocket disconnected." } });
				delete haWsCallbacks[id];
			}
		});
		if (reconnectTimer) clearTimeout(reconnectTimer);
		reconnectTimer = setTimeout(connectHAWebSocket, 5000);
	};

	haSocket.onerror = (error) => console.error("HA WebSocket error encountered:", error);
}

async function fetchHAEntities() {
	if (!config.HA_URL || !config.HA_TOKEN) return;
	try {
		const res = await axios.get(`${config.HA_URL}/api/states`, {
			headers: { 'Authorization': `Bearer ${config.HA_TOKEN}` },
			timeout: 3000
		});
		if (res.status === 200) {
			const entities = res.data;
			haCameras = entities.filter(e => e.entity_id.startsWith('camera.'));
			console.log("Dynamic HA Cameras discovered:", haCameras.map(c => c.entity_id));
			updateCameraDropdownLabels();
		}
	} catch (e) {
		console.warn("Could not retrieve friendly camera labels:", e.message);
	}
}

function updateCameraDropdownLabels() {
	const populateWithHA = (selectElement, currentVal) => {
		if (!selectElement) return currentVal;
		let html = '';
		
		if (haCameras && haCameras.length > 0) {
			html += '<optgroup label="Home Assistant Cameras">';
			haCameras.forEach(cam => {
				const friendlyName = cam.attributes.friendly_name || cam.entity_id;
				html += `<option value="${cam.entity_id}">${friendlyName}</option>`;
			});
			html += '</optgroup>';
		}
		
		html += '<optgroup label="Local RTSP Channels">';
		for (let i = 1; i <= 5; i++) {
			html += `<option value="rtsp_${i}">Channel ${i}</option>`;
		}
		html += '</optgroup>';
		
		selectElement.innerHTML = html;
		
		const optionExists = Array.from(selectElement.options).some(opt => opt.value === currentVal);
		if (optionExists) {
			selectElement.value = currentVal;
			return currentVal;
		} else {
			if (selectElement.options.length > 0) {
				selectElement.value = selectElement.options[0].value;
				return selectElement.options[0].value;
			}
		}
		return currentVal;
	};

	if (cameraSelect) singleCh = populateWithHA(cameraSelect, singleCh);
	if (slots['1'].select) camCh1 = populateWithHA(slots['1'].select, camCh1);
	if (slots['2'].select) camCh2 = populateWithHA(slots['2'].select, camCh2);
	if (slots['3'].select) camCh3 = populateWithHA(slots['3'].select, camCh3);
	if (slots['4'].select) camCh4 = populateWithHA(slots['4'].select, camCh4);
	if (slots['5'].select) camCh5 = populateWithHA(slots['5'].select, camCh5);
	
	localStorage.setItem('singleCh', singleCh);
	localStorage.setItem('camCh1', camCh1);
	localStorage.setItem('camCh2', camCh2);
	localStorage.setItem('camCh3', camCh3);
	localStorage.setItem('camCh4', camCh4);
	localStorage.setItem('camCh5', camCh5);
}

// --- Helper: Retrieve channel active in a grid role ---
function activeRoleChannel(role) {
	if (role === 'main') return singleCh;
	if (role === '1') return camCh1;
	if (role === '2') return camCh2;
	if (role === '3') return camCh3;
	if (role === '4') return camCh4;
	if (role === '5') return camCh5;
	return null;
}

// --- TensorFlow.js cocoSsd Model Loader & Loop ---
async function loadAIModel() {
	// Start loop immediately so pixel-based fallback motion starts running instantly!
	startAIDetectionLoop();

	try {
		console.log("AI Analyzer loading...");
		const badge = document.getElementById('ai-status-badge');
		if (badge) {
			badge.innerHTML = '<span class="spinner-mini"></span> Loading AI Analyzer...';
			badge.className = 'ai-hud-badge detecting';
		}
		
		// Force GPU acceleration via WebGL backend
		if (window.tf) {
			console.log("Configuring TensorFlow.js WebGL backend...");
			try {
				await tf.setBackend('webgl');
				await tf.ready();
				console.log("TensorFlow.js using WebGL backend:", tf.getBackend());
			} catch (tfBackendErr) {
				console.warn("Failed to set WebGL backend, falling back to default:", tfBackendErr);
			}
		}
		
		// Load lightweight object classification model (mobilenet_v2)
		cocoModel = await cocoSsd.load({ base: 'mobilenet_v2' });
		
		console.log("cocoSsd object classification loaded successfully.");
		if (badge) {
			badge.innerHTML = '\u25cf AI Watcher Active';
			badge.style.borderColor = 'rgba(52, 199, 89, 0.4)';
			badge.style.background = 'rgba(52, 199, 89, 0.15)';
			badge.style.color = '#a3ffb8';
		}
	} catch (e) {
		console.error("cocoSsd model loading failed:", e);
		const badge = document.getElementById('ai-status-badge');
		if (badge) {
			badge.innerHTML = '\u25cf Motion Watcher Active'; // Fallback mode active
			badge.style.borderColor = 'rgba(52, 199, 89, 0.4)';
			badge.style.background = 'rgba(52, 199, 89, 0.15)';
			badge.style.color = '#a3ffb8';
		}
	}
}

function getActiveStreamElement(role) {
	let videoEl, imgEl;
	if (role === 'main') {
		videoEl = videoSingle;
		imgEl = imgStreamSingle;
	} else {
		videoEl = slots[role].video;
		imgEl = slots[role].img;
	}

	// Dynamically determine the active element by visibility state
	// In native WebRTC, the video element is shown. In proxy polling fallback, the image element is shown.
	if (imgEl && imgEl.style.display !== 'none' && !imgEl.classList.contains('hidden')) {
		return imgEl;
	}
	return videoEl;
}

function isElementReadyForAI(element) {
	if (!element) return false;
	if (element.tagName === 'IMG') {
		return element.complete && element.naturalWidth > 0;
	} else if (element.tagName === 'VIDEO') {
		return element.readyState >= 2;
	}
	return false;
}

function detectPixelMotion(activeElement, role) {
	if (!activeElement || !isElementReadyForAI(activeElement)) return false;
	
	const width = 80;
	const height = 60;
	
	if (!window.motionCanvas) {
		window.motionCanvas = document.createElement('canvas');
	}
	window.motionCanvas.width = width;
	window.motionCanvas.height = height;
	
	const ctx = window.motionCanvas.getContext('2d');
	ctx.drawImage(activeElement, 0, 0, width, height);
	
	let frameData;
	try {
		frameData = ctx.getImageData(0, 0, width, height);
	} catch (e) {
		return false;
	}
	
	const pixels = frameData.data;
	const length = pixels.length;
	
	// Convert current frame to grayscale average array
	const gray = new Uint8Array(width * height);
	for (let i = 0, j = 0; i < length; i += 4, j++) {
		gray[j] = (pixels[i] + pixels[i+1] + pixels[i+2]) / 3;
	}
	
	const prev = prevFrameData[role];
	prevFrameData[role] = gray;
	
	if (!prev) return false;
	
	let diffCount = 0;
	const pixelThreshold = 10; // Lowered to 10 for highly sensitive slow-motion detection in low light
	
	for (let i = 0; i < gray.length; i++) {
		const diff = Math.abs(gray[i] - prev[i]);
		if (diff > pixelThreshold) {
			diffCount++;
		}
	}
	
	// Extremely sensitive noise gate for slow/far movements: 20 pixels out of 4800 pixels (~0.41%)
	const motionThreshold = 20;
	return diffCount > motionThreshold;
}

// Global pure motion fallback trigger when TF.js is offline or disabled
function triggerMotionDetection(sourceRole = "", activeElement = null, canvas = null) {
	const now = Date.now();
	
	// Start DVR recording
	if (activeElement && canvas) {
		startDVR(sourceRole, activeElement, canvas);
	}
	
	// Add highlights and handle focus/swaps
	applySmartFocusOrSwap(sourceRole, false);
	
	if (now - lastPersonDetectionTime < 5000) return;
	lastPersonDetectionTime = now;
	
	console.log(`[Motion Event Fallback] Motion detected on role ${sourceRole}!`);
	
	playAudioChime(); // Play pleasant synthetic dual-tone chime
	
	const badge = document.getElementById('ai-status-badge');
	if (badge) {
		badge.innerHTML = '\u25cf MOTION DETECTED!';
		badge.style.background = 'rgba(255, 149, 0, 0.35)'; // Orange for pure motion
		badge.style.borderColor = 'rgba(255, 149, 0, 0.8)';
		badge.style.color = '#ffffff';
		
		setTimeout(() => {
			if (!cocoModel || !aiActive) {
				badge.innerHTML = '\u25cf Motion Watcher Active';
				badge.style.background = 'rgba(52, 199, 89, 0.15)';
				badge.style.borderColor = 'rgba(52, 199, 89, 0.4)';
				badge.style.color = '#a3ffb8';
			}
		}, 3000);
	}
}

// Unified helper function to apply smart focused view mode or swap Slot X to Slot 1 in grid views
function applySmartFocusOrSwap(sourceRole, isPerson, score = null) {
	const typeText = isPerson ? 'Person Detected' : 'Motion Detected';
	const typeIcon = isPerson ? 'ðŸ ƒ' : 'ðŸ””';
	
	// 1. If currently in single view mode, we don't swap grids.
	if (viewMode === 'single') {
		// Flash red outline on single viewport
		videoContainerSingle.classList.add('motion-detected-slot');
		if (videoContainerSingle.motionTimer) clearTimeout(videoContainerSingle.motionTimer);
		videoContainerSingle.motionTimer = setTimeout(() => {
			videoContainerSingle.classList.remove('motion-detected-slot');
		}, 4000);
		return;
	}
	
	// 2. If focus is on slot 1, it's already in the main slot. Reset timer and highlight.
	if (sourceRole === '1') {
		slots['1'].el.classList.add('motion-detected-slot');
		if (slots['1'].el.motionTimer) clearTimeout(slots['1'].el.motionTimer);
		slots['1'].el.motionTimer = setTimeout(() => {
			slots['1'].el.classList.remove('motion-detected-slot');
		}, 4000);
		
		// Extend layout restoration cooldown
		if (isSmartFocused || isSmartSwapped) {
			if (restoreTimeout) clearTimeout(restoreTimeout);
			restoreTimeout = setTimeout(() => {
				restorePreviousLayout();
			}, 8000);
		}
		return;
	}
	
	// 3. We support slots '2', '3', '4', '5' for swap focus inside 'five' / 'triple' layouts
	const outerRoles = ['2', '3', '4', '5'];
	
	if ((viewMode === 'five' || viewMode === 'triple') && outerRoles.includes(sourceRole)) {
		// If another smart swap is active for a different slot, revert it first to avoid mixing camera channels
		if (isSmartSwapped && smartSwappedSlot !== sourceRole) {
			console.log(`[Smart Swap Match] Another swap active for ${smartSwappedSlot}, reverting first...`);
			const roleX = smartSwappedSlot;
			camCh1 = previousCamCh1;
			if (roleX === '2') camCh2 = previousCamChX;
			else if (roleX === '3') camCh3 = previousCamChX;
			else if (roleX === '4') camCh4 = previousCamChX;
			else if (roleX === '5') camCh5 = previousCamChX;
			
			isSmartSwapped = false;
			smartSwappedSlot = null;
		}
		
		// Activate the new Smart Swap
		if (!isSmartSwapped) {
			console.log(`[Smart Swap Activated] Swapping slot ${sourceRole} stream into slot 1...`);
			isSmartSwapped = true;
			smartSwappedSlot = sourceRole;
			previousCamCh1 = camCh1;
			previousCamChX = activeRoleChannel(sourceRole);
			
			// Swap channels
			const temp = camCh1;
			camCh1 = previousCamChX;
			
			if (sourceRole === '2') camCh2 = temp;
			else if (sourceRole === '3') camCh3 = temp;
			else if (sourceRole === '4') camCh4 = temp;
			else if (sourceRole === '5') camCh5 = temp;
			
			// Update selectors in UI visually without saving to localStorage (temporary swap)
			slots['1'].select.value = camCh1;
			slots[sourceRole].select.value = temp;
			
			refreshStreams();
			showToastNotification(typeText, `Camera moved to the focus screen.`, typeIcon);
		}
		
		// Highlight Slot 1 border to show active focused stream alert
		slots['1'].el.classList.add('motion-detected-slot');
		if (slots['1'].el.motionTimer) clearTimeout(slots['1'].el.motionTimer);
		slots['1'].el.motionTimer = setTimeout(() => {
			slots['1'].el.classList.remove('motion-detected-slot');
		}, 4000);
		
	} else if (viewMode === 'dual' || viewMode === 'quad') {
		// Fallback to legacy single mode maximize for layouts with no focused Slot 1
		if (!isSmartFocused) {
			const focusedChannel = activeRoleChannel(sourceRole);
			if (focusedChannel) {
				console.log(`[Smart Focus Mode Activated] Maximizing slot ${sourceRole} (${focusedChannel}) to full screen...`);
				isSmartFocused = true;
				previousViewMode = viewMode;
				previousSingleCh = singleCh;
				
				viewMode = 'single';
				singleCh = focusedChannel;
				
				viewModeSelect.value = 'single';
				cameraSelect.value = singleCh;
				
				updateLayout();
				refreshStreams();
				showToastNotification(typeText, `Camera maximized to full screen.`, typeIcon);
			}
		}
	}
	
	// Highlight source slot outline as well
	if (slots[sourceRole]) {
		slots[sourceRole].el.classList.add('motion-detected-slot');
		if (slots[sourceRole].el.motionTimer) clearTimeout(slots[sourceRole].el.motionTimer);
		slots[sourceRole].el.motionTimer = setTimeout(() => {
			slots[sourceRole].el.classList.remove('motion-detected-slot');
		}, 4000);
	}
	
	// Reset or extend layout restoration countdown
	if (restoreTimeout) clearTimeout(restoreTimeout);
	restoreTimeout = setTimeout(() => {
		restorePreviousLayout();
	}, 8000);
}

async function scanRole(role, activeElement, canvas) {
	if (!activeElement || !isElementReadyForAI(activeElement)) return;
	
	// 1. Scan physical motion first (<0.2ms)
	const hasMotion = detectPixelMotion(activeElement, role);
	
	let mBuf = motionBuffer[role] || 0;
	if (hasMotion) {
		mBuf = Math.min(10, mBuf + 4);
		lastMotionDetectedTime[role] = Date.now();
	} else {
		mBuf = Math.max(0, mBuf - 1);
	}
	motionBuffer[role] = mBuf;
	activeMotionDetections[role] = mBuf >= 3;
	
	const isCurrentlyTrackingPerson = activePersonDetections[role] || (personDetectionBuffer[role] > 0);
	
	// Increment frame counter for periodic check fallback
	if (!window.aiFrameCounter) window.aiFrameCounter = {};
	if (window.aiFrameCounter[role] === undefined) window.aiFrameCounter[role] = 0;
	window.aiFrameCounter[role]++;
	const isPeriodicCheck = (window.aiFrameCounter[role] % 15 === 0); // Check periodically once every ~2 seconds even in absolute stillness
	
	// 2. Decide if we trigger TensorFlow AI
	const shouldRunAI = cocoModel && aiActive && (hasMotion || isCurrentlyTrackingPerson || isPeriodicCheck);
	
	if (shouldRunAI) {
		try {
			const vWidth = activeElement.tagName === 'IMG' ? (activeElement.naturalWidth || 640) : (activeElement.videoWidth || 640);
			const vHeight = activeElement.tagName === 'IMG' ? (activeElement.naturalHeight || 480) : (activeElement.videoHeight || 480);
			
			const predictions = await cocoModel.detect(activeElement);
			
			let sens = config.AI_SENSITIVITY !== undefined ? config.AI_SENSITIVITY : 0.45;
			// Dynamically drop confidence score threshold when pixel motion is active to catch weird angles/distant profiles easily
			if (hasMotion || activeMotionDetections[role]) {
				sens = Math.max(0.25, sens - 0.15);
			}
			const minSizeRatio = config.AI_MIN_BOX_SIZE !== undefined ? config.AI_MIN_BOX_SIZE : 0.02;
			
			const filtered = predictions.filter(p => {
				if (p.class !== 'person') return false;
				if (p.score < sens) return false;
				const [x, y, w, h] = p.bbox;
				if (w < 12 || h < 12) return false; // slightly more forgiving bounding box sizes for distant subjects
				if (w < vWidth * minSizeRatio && h < vHeight * minSizeRatio) return false;
				return true;
			});
			
			predictionCache[role] = filtered;
			
			const hasPerson = filtered.length > 0;
			let pBuf = personDetectionBuffer[role] || 0;
			
			if (hasPerson) {
				// INSTANT TRIGGER on first positive frame to catch fast exits/entrances!
				if (!activePersonDetections[role] && pBuf === 0) {
					activePersonDetections[role] = true;
					const score = filtered[0].score;
					triggerPersonDetection(score, role, activeElement, canvas);
				}
				pBuf = Math.min(5, pBuf + 3); // Rise quickly
			} else {
				pBuf = Math.max(0, pBuf - 1); // Fade slowly
			}
			personDetectionBuffer[role] = pBuf;
			
			if (pBuf >= 3) {
				activePersonDetections[role] = true;
			} else if (pBuf === 0) {
				activePersonDetections[role] = false;
				predictionCache[role] = []; // Clear tracking lines
			}
			
			if (activePersonDetections[role]) {
				const maxScore = filtered.length > 0 ? filtered.reduce((max, p) => p.score > max ? p.score : max, 0.5) : 0.5;
				triggerPersonDetection(maxScore, role, activeElement, canvas);
			}
		} catch (err) {
			console.error(`AI scan error on role ${role}:`, err);
		}
	} else {
		predictionCache[role] = []; // Clear caching visual boxes
		
		// Fallback Mode logic if TF is not loaded or disabled
		if (!cocoModel || !aiActive) {
			if (activeMotionDetections[role]) {
				triggerMotionDetection(role, activeElement, canvas);
			}
		}
	}
}

function startAIDetectionLoop() {
	if (aiDetectionInterval) clearTimeout(aiDetectionInterval);
	
	// Interpolate bounding boxes in 60fps render loop
	startRenderLoop();
	
	async function scanLoop() {
		if (isAppHidden) {
			aiDetectionInterval = setTimeout(scanLoop, 1000);
			return;
		}
		if (isPaused) {
			aiDetectionInterval = setTimeout(scanLoop, 800);
			return;
		}
		
		if (viewMode === 'single') {
			const activeElement = getActiveStreamElement('main');
			const canvas = canvasSingle;
			if (activeElement && isElementReadyForAI(activeElement)) {
				await scanRole('main', activeElement, canvas);
				const isBusy = activeMotionDetections['main'] || activePersonDetections['main'];
				aiDetectionInterval = setTimeout(scanLoop, isBusy ? 200 : 400);
				return;
			}
		} else {
			const activeRoles = [];
			if (viewMode === 'dual') activeRoles.push('1', '2');
			else if (viewMode === 'triple') activeRoles.push('1', '2', '3');
			else if (viewMode === 'quad') activeRoles.push('1', '2', '3', '4');
			else if (viewMode === 'five') activeRoles.push('1', '2', '3', '4', '5');
			
			let isAnyBusy = false;
			for (const role of activeRoles) {
				const activeElement = getActiveStreamElement(role);
				if (activeElement && isElementReadyForAI(activeElement)) {
					const canvas = slots[role].canvas;
					await scanRole(role, activeElement, canvas);
					if (activeMotionDetections[role] || activePersonDetections[role]) {
						isAnyBusy = true;
					}
				}
			}
			
			aiDetectionInterval = setTimeout(scanLoop, isAnyBusy ? 200 : 400);
			return;
		}
		
		aiDetectionInterval = setTimeout(scanLoop, 400);
	}
	
	scanLoop();
}

function triggerPersonDetection(score, sourceRole = "", activeElement = null, aiCanvas = null) {
	const now = Date.now();
	
	// 1. Launch DVR Auto-Recording
	if (activeElement && aiCanvas) {
		startDVR(sourceRole, activeElement, aiCanvas);
	}

	// 2. Add highlights and apply layout-aware focus/swapping
	applySmartFocusOrSwap(sourceRole, true, score);

	// Rate-limit high-priority system level notifications to 5 seconds
	if (now - lastPersonDetectionTime < 5000) return;
	lastPersonDetectionTime = now;
	
	console.log(`[AI Event Dispatch] Person detected on role ${sourceRole}! Confidence: ${score.toFixed(2)}`);
	
	// Send IPC event to main process (triggers native notification, wakes display)
	ipcRenderer.send('person-detected');
	
	// Heartbeat color animation on HUD Status Badge
	const badge = document.getElementById('ai-status-badge');
	if (badge) {
		badge.innerHTML = '\u25cf PERSON DETECTED!';
		badge.style.background = 'rgba(255, 59, 48, 0.35)';
		badge.style.borderColor = 'rgba(255, 59, 48, 0.8)';
		badge.style.color = '#ffffff';
		
		setTimeout(() => {
			if (cocoModel && aiActive) {
				badge.innerHTML = '\u25cf AI Watcher Active';
				badge.style.background = 'rgba(52, 199, 89, 0.15)';
				badge.style.borderColor = 'rgba(52, 199, 89, 0.4)';
				badge.style.color = '#a3ffb8';
			}
		}, 3000);
	}
}

function restorePreviousLayout() {
	if (!isSmartFocused && !isSmartSwapped) return;
	
	if (isSmartFocused) {
		console.log(`[Smart Focus Cooldown Complete] Restoring layout back to ${previousViewMode}...`);
		
		viewMode = previousViewMode;
		singleCh = previousSingleCh;
		isSmartFocused = false;
		
		viewModeSelect.value = viewMode;
		cameraSelect.value = singleCh;
		
		updateLayout();
	} else if (isSmartSwapped) {
		const roleX = smartSwappedSlot;
		console.log(`[Smart Swap Cooldown Complete] Restoring swapped camera in slot ${roleX} back to original...`);
		
		camCh1 = previousCamCh1;
		if (roleX === '2') camCh2 = previousCamChX;
		else if (roleX === '3') camCh3 = previousCamChX;
		else if (roleX === '4') camCh4 = previousCamChX;
		else if (roleX === '5') camCh5 = previousCamChX;
		
		isSmartSwapped = false;
		smartSwappedSlot = null;
		
		// Synchronize selector drop-downs in UI visually
		slots['1'].select.value = camCh1;
		if (slots[roleX]) {
			slots[roleX].select.value = previousCamChX;
		}
	}
	
	refreshStreams();
	
	// Clear all highlights
	videoContainerSingle.classList.remove('motion-detected-slot');
	Object.values(slots).forEach(s => s.el.classList.remove('motion-detected-slot'));
	
	showToastNotification('Normal View', 'Camera layout has been restored.', 'ðŸ“º');
}

// --- Decoupled 60fps Bounding Box Interpolation Engine ---
let isRenderLoopActive = false;

function startRenderLoop() {
	if (isRenderLoopActive) return;
	isRenderLoopActive = true;
	
	function loop() {
		if (!aiActive) {
			isRenderLoopActive = false;
			return;
		}
		
		if (viewMode === 'single') {
			renderPredictionsForRole('main', canvasSingle);
		} else {
			if (viewMode === 'dual') {
				renderPredictionsForRole('1', slots['1'].canvas);
				renderPredictionsForRole('2', slots['2'].canvas);
			} else if (viewMode === 'triple') {
				renderPredictionsForRole('1', slots['1'].canvas);
				renderPredictionsForRole('2', slots['2'].canvas);
				renderPredictionsForRole('3', slots['3'].canvas);
			} else if (viewMode === 'quad') {
				renderPredictionsForRole('1', slots['1'].canvas);
				renderPredictionsForRole('2', slots['2'].canvas);
				renderPredictionsForRole('3', slots['3'].canvas);
				renderPredictionsForRole('4', slots['4'].canvas);
			} else if (viewMode === 'five') {
				renderPredictionsForRole('1', slots['1'].canvas);
				renderPredictionsForRole('2', slots['2'].canvas);
				renderPredictionsForRole('3', slots['3'].canvas);
				renderPredictionsForRole('4', slots['4'].canvas);
				renderPredictionsForRole('5', slots['5'].canvas);
			}
		}
		
		requestAnimationFrame(loop);
	}
	
	requestAnimationFrame(loop);
}

function renderPredictionsForRole(role, canvas) {
	const ctx = canvas.getContext('2d');
	const video = getActiveStreamElement(role);
	
	if (!video || !isElementReadyForAI(video) || !canvas) {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		return;
	}
	
	// Re-size canvas dynamically if bounds change
	if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
		canvas.width = video.clientWidth;
		canvas.height = video.clientHeight;
	}
	
	const cWidth = canvas.width;
	const cHeight = canvas.height;
	ctx.clearRect(0, 0, cWidth, cHeight);
	
	const targetPreds = predictionCache[role] || [];
	let currentSmooth = smoothPredictions[role] || [];
	
	const matchedTargets = new Set();
	const nextSmooth = [];
	
	// Match raw targets to smooth frames for beautiful Lerp coordinates mapping
	currentSmooth.forEach(s => {
		let closestTarget = null;
		let closestDist = Infinity;
		let closestIndex = -1;
		
		targetPreds.forEach((t, tIdx) => {
			if (t.class === s.class && !matchedTargets.has(tIdx)) {
				const tCx = t.bbox[0] + t.bbox[2]/2;
				const tCy = t.bbox[1] + t.bbox[3]/2;
				const sCx = s.bbox[0] + s.bbox[2]/2;
				const sCy = s.bbox[1] + s.bbox[3]/2;
				const dist = Math.hypot(tCx - sCx, tCy - sCy);
				
				if (dist < closestDist) {
					closestDist = dist;
					closestTarget = t;
					closestIndex = tIdx;
				}
			}
		});
		
		if (closestTarget) {
			matchedTargets.add(closestIndex);
			const lerpFactor = 0.22; // Smooth tracking coordinate coefficient
			s.bbox[0] += (closestTarget.bbox[0] - s.bbox[0]) * lerpFactor;
			s.bbox[1] += (closestTarget.bbox[1] - s.bbox[1]) * lerpFactor;
			s.bbox[2] += (closestTarget.bbox[2] - s.bbox[2]) * lerpFactor;
			s.bbox[3] += (closestTarget.bbox[3] - s.bbox[3]) * lerpFactor;
			s.score += (closestTarget.score - s.score) * lerpFactor;
			s.life = 1.0;
			nextSmooth.push(s);
		} else {
			// Decay life to fade out smoothly instead of hard vanishing
			s.life -= 0.08;
			if (s.life > 0) {
				nextSmooth.push(s);
			}
		}
	});
	
	targetPreds.forEach((t, tIdx) => {
		if (!matchedTargets.has(tIdx)) {
			nextSmooth.push({
				class: t.class,
				bbox: [...t.bbox],
				score: t.score,
				life: 1.0
			});
		}
	});
	
	smoothPredictions[role] = nextSmooth;
	
	const vWidth = video.tagName === 'IMG' ? video.naturalWidth : video.videoWidth;
	const vHeight = video.tagName === 'IMG' ? video.naturalHeight : video.videoHeight;
	
	if (!vWidth || !vHeight) return;
	
	// Map display aspect ratios (Letterboxing offset boundaries mapping)
	const videoRatio = vWidth / vHeight;
	const canvasRatio = cWidth / cHeight;
	
	let scale, offsetX, offsetY;
	if (canvasRatio > videoRatio) {
		scale = cHeight / vHeight;
		offsetX = (cWidth - vWidth * scale) / 2;
		offsetY = 0;
	} else {
		scale = cWidth / vWidth;
		offsetX = 0;
		offsetY = (cHeight - vHeight * scale) / 2;
	}
	
	nextSmooth.forEach(s => {
		if (s.class !== 'person') return;
		if (s.score < 0.35) return;
		
		const [x, y, width, height] = s.bbox;
		const rx = x * scale + offsetX;
		const ry = y * scale + offsetY;
		const rw = width * scale;
		const rh = height * scale;
		
		const color = '#ff3b30';
		
		ctx.save();
		ctx.globalAlpha = s.life;
		
		// Glowing thin pulse style border
		const time = Date.now() / 180;
		const pulseWidth = 2 + Math.sin(time) * 0.4;
		
		ctx.strokeStyle = color;
		ctx.lineWidth = pulseWidth;
		ctx.strokeRect(rx, ry, rw, rh);
		
		// Glowing corners brackets (CCTV style)
		const corner = Math.min(16, rw / 4, rh / 4);
		ctx.strokeStyle = color;
		ctx.lineWidth = 4;
		ctx.shadowColor = color;
		ctx.shadowBlur = 8;
		
		// Top-Left
		ctx.beginPath();
		ctx.moveTo(rx, ry + corner);
		ctx.lineTo(rx, ry);
		ctx.lineTo(rx + corner, ry);
		ctx.stroke();
		
		// Top-Right
		ctx.beginPath();
		ctx.moveTo(rx + rw - corner, ry);
		ctx.lineTo(rx + rw, ry);
		ctx.lineTo(rx + rw, ry + corner);
		ctx.stroke();
		
		// Bottom-Left
		ctx.beginPath();
		ctx.moveTo(rx, ry + rh - corner);
		ctx.lineTo(rx, ry + rh);
		ctx.lineTo(rx + corner, ry + rh);
		ctx.stroke();
		
		// Bottom-Right
		ctx.beginPath();
		ctx.moveTo(rx + rw - corner, ry + rh);
		ctx.lineTo(rx + rw, ry + rh);
		ctx.lineTo(rx + rw, ry + rh - corner);
		ctx.stroke();
		
		ctx.shadowBlur = 0; // Clear blur
		
		// Semi-transparent tag label
		ctx.fillStyle = 'rgba(255, 59, 48, 0.85)';
		ctx.font = 'bold 11px "Inter", -apple-system, sans-serif';
		
		const labelText = `[AI] PERSON ${Math.round(s.score * 100)}%`;
		const textWidth = ctx.measureText(labelText).width;
		
		// Label border
		ctx.fillRect(rx, ry - 19, textWidth + 12, 19);
		
		ctx.fillStyle = '#ffffff';
		ctx.fillText(labelText, rx + 6, ry - 6);
		
		ctx.restore();
	});
}

// --- DVR (Auto-Recording) System ---
let dvrRecorders = {};
let dvrChunks = {};
let dvrTimeouts = {};
let dvrIntervals = {};

async function startDVR(role, activeElement, aiCanvas) {
	if (dvrRecorders[role] && dvrRecorders[role].state !== 'inactive') {
		// Recording already active, reset cooldown timer
		clearTimeout(dvrTimeouts[role]);
		dvrTimeouts[role] = setTimeout(() => stopDVR(role), 15000); // Keep recording for 15s after last motion
		return;
	}

	console.log(`[DVR Recorder Start] Opening active buffer for role ${role}`);
	showRecIndicator(true);

	const streamCanvas = document.createElement('canvas');
	const ctx = streamCanvas.getContext('2d');
	
	dvrIntervals[role] = setInterval(() => {
		if (!activeElement || !activeElement.clientWidth) return;
		streamCanvas.width = activeElement.clientWidth;
		streamCanvas.height = activeElement.clientHeight;
		
		ctx.fillStyle = 'black';
		ctx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);
		
		try {
			ctx.drawImage(activeElement, 0, 0, streamCanvas.width, streamCanvas.height);
		} catch(e){}
		
		try {
			ctx.drawImage(aiCanvas, 0, 0, streamCanvas.width, streamCanvas.height);
		} catch(e){}
	}, 100);

	try {
		const stream = streamCanvas.captureStream(10); // Capture offscreen canvas at 10 fps
		const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
		
		dvrChunks[role] = [];
		recorder.ondataavailable = e => {
			if (e.data.size > 0) dvrChunks[role].push(e.data);
		};
		
		recorder.onstop = async () => {
			clearInterval(dvrIntervals[role]);
			const blob = new Blob(dvrChunks[role], { type: 'video/webm' });
			const arrayBuffer = await blob.arrayBuffer();
			const buffer = new Uint8Array(arrayBuffer);
			
			ipcRenderer.send('save-video-recording', {
				role: role,
				buffer: buffer
			});
			
			dvrChunks[role] = [];
			checkAllDVRsStopped();
		};
		
		recorder.start();
		dvrRecorders[role] = recorder;
		
		dvrTimeouts[role] = setTimeout(() => stopDVR(role), 15000);
	} catch (e) {
		console.error("[DVR] Failed to instantiate MediaRecorder:", e);
	}
}

function stopDVR(role) {
	if (dvrRecorders[role] && dvrRecorders[role].state !== 'inactive') {
		dvrRecorders[role].stop();
		console.log(`[DVR Recorder Stop] Cooldown finished, closing buffer for role ${role}`);
	}
}

function checkAllDVRsStopped() {
	const isAnyRecording = Object.values(dvrRecorders).some(r => r && r.state !== 'inactive');
	if (!isAnyRecording) showRecIndicator(false);
}

function showRecIndicator(show) {
	const rec = document.getElementById('rec-indicator');
	if (rec) {
		if (show) rec.classList.remove('hidden');
		else rec.classList.add('hidden');
	}
}

// --- Session Live Timer ---
function startTimer() {
	sessionStartTime = new Date();
	timerInterval = setInterval(() => {
		if (isPaused) return;
		const diff = Math.floor((new Date() - sessionStartTime) / 1000);
		const h = Math.floor(diff / 3600).toString().padStart(2, '0');
		const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
		const s = (diff % 60).toString().padStart(2, '0');
		sessionTimer.textContent = `${h}:${m}:${s}`;
	}, 1000);
}

// --- Home Assistant Door Unlock Actions ---
async function openDoor(entityId, button) {
	if (!config.HA_URL || !config.HA_TOKEN) {
		console.warn("HA connection settings are missing.");
		return;
	}
	if (button.disabled) return;
	const originalContent = button.innerHTML;

	button.innerHTML = '<span class="loader-spinner">...</span>';
	button.disabled = true;

	try {
		await axios.post(`${config.HA_URL}/api/services/switch/turn_on`, { entity_id: entityId }, {
			headers: { 'Authorization': `Bearer ${config.HA_TOKEN}` }
		});
		button.innerHTML = 'âœ…';
		button.classList.add('success-pulse');
	} catch (error) {
		console.error("Home Assistant service unlock trigger failed:", error);
		button.innerHTML = 'âš ï¸';
	}

	setTimeout(() => {
		button.innerHTML = originalContent;
		button.disabled = false;
		button.classList.remove('success-pulse');
	}, 1000);
}

// Run setup
init();

// Dynamically sync and update port from config broadcast
ipcRenderer.on('config-updated', (event, newConfig) => {
	config = newConfig;
	streamPort = config.STREAM_PORT || 9999;
});

// Listen to window state change broadcast from main process
ipcRenderer.on('window-state-changed', (event, state) => {
	console.log(`[Window State Changed] Window became: ${state}`);
	if (state === 'hidden') {
		isAppHidden = true;
		// Deconstruct all players to free NVR connections, CPU, and FFmpeg transcoders
		['main', '1', '2', '3', '4', '5'].forEach(cleanupSlotPlayers);
		console.log("[Window State Changed] Streams and AI completely suspended.");
	} else if (state === 'visible') {
		isAppHidden = false;
		console.log("[Window State Changed] Window restored, resuming streams...");
		refreshStreams();
	}
});

// Setup Reset Defaults Button Handler in Advanced Settings
const resetDefaultsBtn = document.getElementById('reset-defaults-btn');
if (resetDefaultsBtn) {
	resetDefaultsBtn.addEventListener('click', async () => {
		const confirmReset = confirm("Are you sure you want to reset all configurations to defaults?\nThis will clear all camera URLs, Home Assistant tokens, and local storage variables.");
		if (confirmReset) {
			try {
				const cleanDefaults = {
					HA_URL: 'http://192.168.1.100:8123',
					HA_TOKEN: '',
					RTSP_URL: '',
					DISPLAY_ID: 0,
					DOORBELL_ENTITY: 'binary_sensor.doorbell',
					DOOR_OUTER_ENTITY: 'switch.outer_door',
					DOOR_INNER_ENTITY: 'switch.inner_door',
					DOORBELL_ACTION: 'open',
					AI_SENSITIVITY: 0.40,
					AI_MIN_BOX_SIZE: 0.015
				};
				
				// Save clean defaults to local config.json file in main process
				await ipcRenderer.invoke('save-config', cleanDefaults);
				
				// Clear HTML5 local storage settings (saved layouts, selected streams, onboarding state)
				localStorage.clear();
				
				// Reload window to trigger onboarding flow and apply clean slate
				window.location.reload();
			} catch (e) {
				console.error("Failed to reset settings:", e);
				alert("Error resetting settings. Please see console logs.");
			}
		}
	});
}
