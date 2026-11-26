# VEYRA Desktop v0.5.6 - Cross-Platform Compatibility Matrix

**Release Version:** 0.5.6  
**Electron Version:** 39.2.7  
**Node.js Version:** 22.x  
**Shared Codebase:** 100%

## Platform Support Matrix

| Feature | Windows x64 | Windows ARM64 | macOS Intel x64 | macOS ARM64 | Linux x64 | Linux ARM64 |
|---------|-------------|---------------|-----------------|-------------|-----------|-------------|
| **Installer** | NSIS .exe | NSIS .exe | DMG | DMG | AppImage, DEB | AppImage |
| **Portable** | EXE | Not configured | Not configured | Not configured | Not configured | Not configured |
| **Main Window** | ✅ Verified | ✅ Verified | ✅ CI Build | ✅ CI Build | ✅ CI Build | ✅ CI Build |
| **Overlay Window** | ✅ Verified | ✅ Verified | ✅ CI Build | ✅ CI Build | ✅ CI Build | ✅ CI Build |
| **Microphone** | ✅ Verified | ✅ Verified | ⚠️ Not tested | ⚠️ Not tested | ⚠️ Not tested | ⚠️ Not tested |
| **Screen Capture** | ✅ Verified | ✅ Verified | ⚠️ Not tested | ⚠️ Not tested | ⚠️ Not tested | ⚠️ Not tested |
| **Camera** | ⚠️ Not implemented | ⚠️ Not implemented | ⚠️ Not implemented | ⚠️ Not implemented | ⚠️ Not implemented | ⚠️ Not implemented |
| **Notifications** | ✅ Verified | ✅ Verified | ⚠️ Not tested | ⚠️ Not tested | ⚠️ Not tested | ⚠️ Not tested |
| **Hardware Detection** | ✅ Verified | ✅ Verified | ✅ CI Build | ✅ CI Build | ✅ CI Build | ✅ CI Build |
| **Local AI Models** | ✅ Verified | ✅ Verified | ⚠️ Not tested | ⚠️ Not tested | ⚠️ Not tested | ⚠️ Not tested |
| **Cloud AI** | ✅ Verified | ✅ Verified | ✅ CI Build | ✅ CI Build | ✅ CI Build | ✅ CI Build |
| **Automatic Updates** | ✅ Verified | ✅ Verified | ✅ CI Build | ✅ CI Build | ✅ CI Build | ✅ CI Build |
| **Database (SQLite)** | ✅ Verified | ✅ Verified | ✅ CI Build | ✅ CI Build | ✅ CI Build | ✅ CI Build |
| **File System Access** | ✅ Verified | ✅ Verified | ✅ CI Build | ✅ CI Build | ✅ CI Build | ✅ CI Build |

## Legend

- ✅ **Verified:** Tested on actual hardware
- ✅ **CI Build:** Compiled and built in CI, not tested on actual hardware
- ⚠️ **Not tested:** Implemented but not tested on target OS
- ⚠️ **Not implemented:** Feature not yet implemented

## Operating System Requirements

| Platform | Minimum Version | Recommended Version |
|----------|-----------------|---------------------|
| Windows | Windows 10 (1903+) | Windows 11 |
| macOS | macOS 11 (Big Sur) | macOS 14+ |
| Linux | Ubuntu 20.04+, Debian 11+, Fedora 35+ | Ubuntu 22.04+, Debian 12+, Fedora 40+ |

## Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Processor | Intel Core i3 or equivalent | Intel Core i5 or AMD equivalent |
| Memory | 4 GB RAM | 8 GB RAM |
| Storage | 500 MB available | 2 GB available |
| Graphics | Integrated graphics | Dedicated GPU (for local AI) |

## Local AI Model Support

| Model Runtime | Windows | macOS | Linux | Notes |
|---------------|---------|-------|-------|-------|
| CPU (ONNX) | ✅ Supported | ✅ Supported | ✅ Supported | Universal fallback |
| CUDA (NVIDIA) | ✅ Supported | ❌ Not supported | ✅ Supported | Requires NVIDIA GPU |
| Metal (Apple Silicon) | ❌ Not supported | ✅ Supported | ❌ Not supported | Apple Silicon only |
| DirectML (Windows) | ✅ Supported | ❌ Not supported | ❌ Not supported | Windows only |

## Permission Requirements by Platform

### Windows
- Microphone: Settings > Privacy > Microphone
- Screen Capture: Settings > Privacy > Apps for web
- Notifications: Settings > System > Notifications

### macOS
- Microphone: System Settings > Privacy & Security > Microphone
- Camera: System Settings > Privacy & Security > Camera
- Screen Recording: System Settings > Privacy & Security > Screen Recording
- Accessibility: System Settings > Privacy & Security > Accessibility
- Notifications: System Settings > Notifications

### Linux
- Microphone: Desktop environment settings (varies by distro)
- Screen Capture: PipeWire + xdg-desktop-portal (Wayland) or X11 (X11)
- Notifications: Desktop environment notifications (varies by distro)

## Unsupported Platforms

| Platform | Reason |
|----------|--------|
| Android | Electron Desktop is not designed for Android |
| iOS | Electron Desktop is not designed for iOS |
| FreeBSD | No official Electron builds |
| ChromeOS | Not officially supported by Electron |

## Signed/Unsigned Status

| Platform | Code Signed | Notarized | SmartScreen/Gatekeeper |
|----------|-------------|-----------|------------------------|
| Windows | ❌ No | N/A | ⚠️ Warning expected |
| macOS | ❌ No | ❌ No | ⚠️ Warning expected |
| Linux | ❌ No | N/A | No warnings expected |

## Download Links

| Platform | Architecture | URL |
|----------|-------------|-----|
| Windows | x64 | https://veyra-al.vercel.app/download/windows |
| macOS | x64, ARM64 | https://veyra-al.vercel.app/download/macos |
| Linux | x64, ARM64 | https://veyra-al.vercel.app/download/linux |
