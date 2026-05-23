# 📺 Home Assistant Camera Monitor (HA-PC-Cam-Monitor)

[![Platform](https://img.shields.io/badge/platform-Windows-blue.svg?style=for-the-badge&logo=windows)](https://github.com/TheK3R1M/Home-assistant-camera-app)
[![Framework](https://img.shields.io/badge/framework-Electron-47848F.svg?style=for-the-badge&logo=electron)](https://github.com/electron/electron)
[![Engine](https://img.shields.io/badge/AI_Engine-TensorFlow.js-FF6F00.svg?style=for-the-badge&logo=tensorflow)](https://js.tensorflow.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](https://github.com/TheK3R1M/Home-assistant-camera-app/blob/main/LICENSE)

A premium, borderless desktop dashboard designed to seamlessly integrate Home Assistant camera feeds, smart locks, and live sensors directly onto a secondary PC monitor. Featuring ultra-low latency streaming, edge-based TensorFlow.js AI object detection, and a high-end frosted glassmorphic UI, it ensures you never miss a visitor while keeping visual clutter to an absolute minimum.

---

## ✨ Features

*   **📱 Glassmorphic Cupertino UI**: Ultra-thin borderless drag headers, radial gradients, frosted glass panels, and smooth transition animations that look stunning on any desktop setup.
*   **⚡ Zero-Lag Sub-100ms MJPEG Streaming**: Completely bypasses HLS transcoding latency by utilizing a customized RAM-piped, zero-disk-write FFmpeg pipeline to deliver instant, real-time live views.
*   **🤖 On-Device AI Watcher (TensorFlow.js)**: Runs light-weight object classification (`mobilenet_v2`) fully locally on the client's GPU. Triggers smart focus alerts or physical OS notifications upon detecting a person.
*   **🖥️ Multi-Monitor Positioning**: Automatically detects system displays and accurately launches full-screen or custom layouts on a designated secondary monitor (Monitor 2, Monitor 3, etc.).
*   **🔗 Unified Intercom & Smart Locks**: Control external switches or smart lock entities on the fly and toggle bidirectional VoIP microphones directly from the screen.
*   **🔐 Encrypted Base64 Settings Sharing**: Export and import your entire connection schema and camera slot alignments instantly using a secure, RustDesk-style XOR-encrypted Base64 payload.
*   **🌐 Zero-Install Web Client**: A fully functional, responsive HTML/JS backup page (`web_index.html`) that replicates connection wizards, live streams, and door controls for instant use on any browser or mobile device.
*   **📦 Double-Click Packaging**: Pre-packaged batch utilities (`build_app.bat` and `git_push.bat`) to let you compile production standalone `.exe` installers and synchronize changes with GitHub in a single click.

---

## 🛠️ System Architecture

The application operates as an event-driven system coordinating local processes with Home Assistant:

```mermaid
graph TD
    HA[Home Assistant Server] -- WS Events / REST API --> Renderer[Electron Renderer UI]
    Renderer -- IPC Window Commands --> Main[Electron Main Process]
    Main -- SysTray / Window Positioning --> Win[Monitor 2 Screen]
    FFmpeg[FFmpeg Transcode Server] -- RAM MJPEG Stream --> Renderer
    Renderer -- Local GPU Frame Analysis --> TF[TensorFlow.js Engine]
```

---

## 🚀 Quick Start & Installation

### Prerequisites

Ensure you have the following installed on your machine:
*   [Node.js](https://nodejs.org/) (v16 or higher recommended)
*   [FFmpeg](https://ffmpeg.org/) (Automatically downloaded or pre-installed for local RTSP streams)

### Development Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/TheK3R1M/Home-assistant-camera-app.git
    cd Home-assistant-camera-app
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Launch the Application**:
    ```bash
    npm start
    ```

4.  **Onboarding Wizard**: On the first launch, a beautiful frosted setup wizard will guide you through connecting to your Home Assistant server, selecting your active secondary monitor, and setting up your smart lock entities.

---

## ⚙️ Configuration Schema

All settings are securely stored locally inside `config.json`. The application handles this automatically, but you can manually inspect or edit it:

```json
{
  "HA_URL": "http://homeassistant.local:8123",
  "HA_TOKEN": "YOUR_LONG_LIVED_ACCESS_TOKEN",
  "RTSP_URL": "rtsp://admin:password@192.168.1.100:554/stream1",
  "DISPLAY_ID": 25281923,
  "DOORBELL_ENTITY": "binary_sensor.doorbell",
  "DOOR_OUTER_ENTITY": "switch.outer_door",
  "DOOR_INNER_ENTITY": "switch.inner_door",
  "DOORBELL_ACTION": "open",
  "AI_SENSITIVITY": 0.55,
  "AI_MIN_BOX_SIZE": 0.04
}
```

*   `HA_URL`: The local or external network address of your Home Assistant server.
*   `HA_TOKEN`: Long-Lived Access Token created in your Home Assistant user profile.
*   `DISPLAY_ID`: The unique system ID of your targeted secondary monitor.
*   `DOORBELL_ENTITY`: The entity ID of your physical doorbell or smart button (e.g., `binary_sensor.doorbell`). You can find this in Home Assistant by navigating to **Settings > Devices & Services > Entities** and searching for your doorbell name.
*   `DOOR_OUTER_ENTITY` / `DOOR_INNER_ENTITY`: The entity ID of the smart switches, buttons, or relays controlling your physical doors or locks (e.g., `switch.outer_door`). You can locate these in the same **Entities** menu under Home Assistant. If you only have a single door, configure `DOOR_OUTER_ENTITY` and you can leave the inner entity blank.
*   `DOORBELL_ACTION`: `open` (automatically show window and pop up feed) or `notify` (show a native Windows push notification banner first).

---

## 🗺️ Home Assistant Integration & Camera Protocol Roadmap

Integrating IP cameras with Home Assistant and this Desktop Monitor requires aligning camera protocols, network architecture, and latency goals. This guide outlines the available protocols, their technical trade-offs, a step-by-step roadmap to integrate them in Home Assistant, and copy-pasteable configuration templates.

### 1. Camera Protocol Comparison & Trade-Offs

| Protocol | Latency | Bandwidth | CPU / Resource Cost | Web Compatibility | Best For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MJPEG** (Motion JPEG) | **⚡ Sub-100ms** | 🔴 Extremely High | 🟡 Medium (High NVR encode) | 🟢 Native (`<img>`) | Ultra-fast local triggers, low-cpu client display. |
| **RTSP** (Real-Time Streaming) | **🟡 1s - 3s** | 🟢 Extremely Low | 🔴 High (If transcoding) | 🔴 Unsupported natively | NVR storage, native IPCam feeds, server-side processing. |
| **WebRTC** (Web Real-Time Comm) | **⚡ < 200ms** | 🟢 Extremely Low | 🟢 Very Low | 🟢 Native (via WebRTC API) | Live interactive views, dual-audio streams, mobile access. |
| **HLS** (HTTP Live Streaming) | 🔴 **3s - 10s** | 🟡 Low | 🟡 Medium (Segment chunking) | 🟢 Native (`<video>`/hls.js) | Public remote access, smart displays, standard casting. |

---

### 2. Multi-Camera Architecture Options

Different camera setups offer different interfaces:
1. **Dynamic Parameterized Stream**: Some NVR systems (e.g., XMeye, Dahua, Hikvision NVRs) expose a single base IP address and port, routing multiple cameras dynamically via a channel parameter in the URL (e.g., `rtsp://nvr-ip:554/ch=1`, `ch=2`).
2. **Distinct RTSP Streams**: Standalone IP cameras (e.g., Reolink, Tapo, Sonoff, ESP32-Cam) each have their own distinct IP addresses and completely separate RTSP endpoints.

**Our App Supports Both Modes!**
- **Fallback Base Mode**: Provide a single `RTSP_URL` in the settings, and the app will dynamically append `channel` numbers (e.g., `/mjpeg?channel=1`).
- **Individual URL Mode**: Click the **"Configure Individual RTSP URLs"** toggle under Settings to set completely distinct RTSP streams (`RTSP_URL_1` to `RTSP_URL_5`) for each channel slot. This ensures support for heterogeneous setups.

---

### 3. Home Assistant Configuration Templates (`configuration.yaml`)

#### A. Generic RTSP Camera Integration
Add this to your `configuration.yaml` to integrate standard RTSP streams as Home Assistant camera entities:

```yaml
camera:
  - platform: generic
    name: "Front Door Camera"
    still_image_url: "http://192.168.1.100/cgi-bin/snapshot.sh?res=low"
    stream_source: "rtsp://admin:password@192.168.1.100:554//h264Preview_01_main"
    authentication: digest

  - platform: generic
    name: "Backyard Camera"
    still_image_url: "http://192.168.1.101/cgi-bin/snapshot.sh?res=low"
    stream_source: "rtsp://admin:password@192.168.1.101:554//h264Preview_01_main"
```

#### B. Low-Latency WebRTC Integration (go2rtc)
Using **go2rtc** is the recommended way to convert RTSP feeds into real-time WebRTC streams with sub-200ms latency. Install it via the **WebRTC Camera** HACS integration or run it standalone, then configure `go2rtc.yaml`:

```yaml
streams:
  front_door:
    - rtsp://admin:password@192.168.1.100:554/h264Preview_01_main
    - ffmpeg:front_door#video=copy#audio=opus  # Transcode audio to WebRTC Opus
  backyard:
    - rtsp://admin:password@192.168.1.101:554/h264Preview_01_main
```

Then reference these streams in Home Assistant using generic configs pointing to the go2rtc RTSP proxy ports (default `8554`):

```yaml
camera:
  - platform: generic
    name: "Front Door WebRTC"
    stream_source: "rtsp://127.0.0.1:8554/front_door"
  - platform: generic
    name: "Backyard WebRTC"
    stream_source: "rtsp://127.0.0.1:8554/backyard"
```

#### C. MJPEG Camera (Direct Snapshot/Stream)
If you prefer pure MJPEG streams with no transcoding overhead, pull directly from your camera's HTTP endpoint:

```yaml
camera:
  - platform: mjpeg
    name: "Living Room MJPEG"
    mjpeg_url: "http://192.168.1.105/mjpeg_stream"
    still_image_url: "http://192.168.1.105/snapshot.jpg"
```

---

### 4. Step-by-Step Integration Roadmap

Follow these 4 phases to achieve an optimal multi-camera monitoring experience:

```mermaid
graph LR
    P1[Phase 1: Networking] --> P2[Phase 2: HA Integration]
    P2 --> P3[Phase 3: WebRTC Optimization]
    P3 --> P4[Phase 4: Monitor Setup]
```

1. **Phase 1: Secure & IP Bindings**
   - Assign static DHCP leases to your IP cameras in your router settings.
   - Set up a sub-stream (lower resolution, e.g., 640x480 or 1280x720) on your cameras. Sub-streams significantly reduce client-side GPU usage and latency during continuous monitoring.
2. **Phase 2: Integrate into Home Assistant**
   - Add the generic camera configurations in `configuration.yaml` as shown above.
   - Restart Home Assistant and verify that the cameras show up in your Lovelace dashboard as `camera.front_door` etc.
3. **Phase 3: Install go2rtc / WebRTC integration**
   - Install HACS (Home Assistant Community Store).
   - Search for and install the **WebRTC Camera** integration (by AlexxIT).
   - This automatically sets up go2rtc on your system, allowing instant peer-to-peer streaming with no transcoding delay.
4. **Phase 4: Bind with HA PC Monitor App**
   - Launch this Desktop App.
   - Fill in your `HA_URL` and `HA_TOKEN` in the Setup Wizard.
   - Open Settings, click **"Configure Individual RTSP URLs"** to toggle individual feeds, and copy-paste your camera stream URLs directly.
   - Align your lock entities (e.g., `switch.outer_door` or `lock.front_door`) and enjoy sub-100ms notifications, dual lock triggers, and autonomous multi-screen popup controls!

---

## 🔔 Doorbell Automation Guide (Home Assistant)

To trigger the chime sound and automatic camera feed popup inside the Desktop App, you can configure your Home Assistant in two different ways. The **Event Trigger (Method B)** is highly recommended as it is completely generalized and does not require hardcoding any specific local PC IP addresses!

### Method A: Entity State Trigger (Default)
If you already have a physical doorbell sensor or smart button integrated in Home Assistant, you can configure the app to watch its state directly.
1. Locate your doorbell entity ID in Home Assistant (e.g., `binary_sensor.doorbell`).
2. Enter this ID in the app's **Doorbell Entity ID** setting.
3. The app will automatically watch this entity via WebSocket. When the state changes from `off` to `on`, the app will instantly ring and pop up.

### Method B: Custom Event Trigger (Highly Recommended & Generalized)
If you want to trigger the app from *any* Home Assistant automation, script, or physical button without hardcoding your local computer's IP address (making it robust across multiple clients), you can fire a custom WebSocket event.

The Desktop App automatically subscribes to the custom event `cam_monitor_event`. 

#### 1. Home Assistant Automation Example
Add this automation to your `automations.yaml` to trigger the app whenever your doorbell button is pressed:

```yaml
- id: trigger_camera_monitor_on_doorbell
  alias: "Trigger Camera Monitor on Doorbell Press"
  trigger:
    - platform: state
      entity_id: binary_sensor.doorbell_button
      to: "on"
  action:
    - event: cam_monitor_event
      event_data:
        type: doorbell
```

#### 2. Manual Action Trigger in Automations UI
If you prefer configuring via the Home Assistant Visual Editor:
* Add a new action: **Manual Action / Fire Event**.
* **Event Type**: `cam_monitor_event`
* **Event Data**:
  ```yaml
  type: doorbell
  ```

This triggers all instances of the **Camera Monitor** desktop application running on your local network simultaneously, fully bypassing the need for static IP targeting or complex `rest_command` webhooks!

---

## 📦 Building & Distribution

We have provided ready-to-run automation scripts for convenience:

*   **Build Standalone Standalone Installer**: Double-click `build_app.bat` to automatically compile a single standalone Windows setup package (`.exe`) inside the `/dist` directory.
*   **Synchronize with Git**: Double-click `git_push.bat` to quickly commit and push all code modifications to your remote GitHub repository (`https://github.com/TheK3R1M/Home-assistant-camera-app.git`).

To run manually via Terminal:
```bash
# Package the application for Windows
npm run build
```

---

## 📝 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
