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
  "HA_URL": "http://ev.local:8123",
  "HA_TOKEN": "YOUR_LONG_LIVED_ACCESS_TOKEN",
  "RTSP_URL": "rtsp://admin:password@192.168.1.100:554/stream1",
  "DISPLAY_ID": 25281923,
  "DOORBELL_ENTITY": "binary_sensor.doorbell",
  "DOOR_OUTER_ENTITY": "switch.dis_kapi_kontrol_dis_kapi",
  "DOOR_INNER_ENTITY": "switch.dis_kapi_kontrol_ic_kapi",
  "DOORBELL_ACTION": "open",
  "AI_SENSITIVITY": 0.55,
  "AI_MIN_BOX_SIZE": 0.04
}
```

*   `HA_URL`: The local or external network address of your Home Assistant server.
*   `HA_TOKEN`: Long-Lived Access Token created in your Home Assistant user profile.
*   `DISPLAY_ID`: The unique system ID of your targeted secondary monitor.
*   `DOORBELL_ACTION`: `open` (automatically show window and pop up feed) or `notify` (show a native Windows push notification banner first).

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
