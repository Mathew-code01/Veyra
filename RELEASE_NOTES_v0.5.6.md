# VEYRA Desktop v0.5.6 Release Notes

**Release Date:** November 23, 2026  
**Version:** 0.5.6  
**Channel:** Stable

## What's New

### Cross-Platform Support
VEYRA Desktop is now officially supported on Windows, macOS, and Linux with a single shared codebase.

- **Windows:** NSIS installer (.exe) and portable EXE
- **macOS:** DMG installer (.dmg) and application ZIP (Intel x64 & Apple Silicon ARM64)
- **Linux:** AppImage, DEB package, and portable archive (x64 & ARM64)

### Automatic Updates
- Background update checking with configurable auto-check
- Stable and beta release channels
- Download progress tracking with resume support
- Integrity verification (SHA-512)
- Updates deferred during active interview sessions

### Permissions System
- Cross-platform permission handling (Windows, macOS, Linux)
- Granular permission controls: microphone, screen capture, camera, notifications, accessibility, documents, downloads
- Platform-specific permission guidance with system settings links
- Permission denial recovery instructions

### Onboarding
- Complete first-launch onboarding flow
- Welcome, sign-in, permissions, hardware assessment, operating mode, provider/model selection
- Persistent onboarding state across restarts
- Optional steps can be skipped
- System readiness check

### AI Providers
- Bring Your Own Key (BYOK) credential management
- Secure credential storage via Electron safeStorage
- Provider verification and health checks
- Model discovery and selection
- Local and cloud AI execution modes

## Downloads

| Platform | Architectures | Format | File Size | Checksum |
|----------|---------------|--------|-----------|----------|
| Windows | x64, ARM64 | NSIS Installer | - | See SHA256SUMS.txt |
| Windows | x64 | Portable EXE | - | See SHA256SUMS.txt |
| macOS | x64, ARM64 | DMG | - | See SHA256SUMS.txt |
| macOS | x64, ARM64 | ZIP | - | See SHA256SUMS.txt |
| Linux | x64, ARM64 | AppImage | - | See SHA256SUMS.txt |
| Linux | x64, ARM64 | DEB | - | See SHA256SUMS.txt |

## Installation

### Windows
1. Download `Veyra-Setup-0.5.6.exe`
2. Run the installer and follow the prompts
3. Choose installation directory or accept default
4. Launch VEYRA from Start Menu or desktop shortcut
5. Complete the onboarding process

### macOS
1. Download `Veyra-0.5.6.dmg`
2. Open the DMG and drag VEYRA to Applications
3. Launch VEYRA from Applications
4. Complete the onboarding process
5. Grant microphone permission when prompted (System Settings > Privacy & Security > Microphone)

### Linux
1. Download `veyra-0.5.6.AppImage` or `veyra-0.5.6.deb`
2. For AppImage: make executable and run
3. For DEB: `sudo dpkg -i veyra-0.5.6.deb`
4. Launch VEYRA from applications menu
5. Complete the onboarding process

## System Requirements

### Windows
- Windows 10 (version 1903+) or Windows 11
- x64 or ARM64 processor
- 4 GB RAM minimum (8 GB recommended)
- 500 MB available disk space

### macOS
- macOS 11 (Big Sur) or later
- Intel x64 or Apple Silicon ARM64
- 4 GB RAM minimum (8 GB recommended)
- 500 MB available disk space

### Linux
- Ubuntu 20.04+, Debian 11+, Fedora 35+, or equivalent
- x64 or ARM64 processor
- 4 GB RAM minimum (8 GB recommended)
- 500 MB available disk space
- libfuse2, libgtk-3-0, libwebkit2gtk-4.1-0 (for AppImage)

## Known Limitations

- **Code Signing:** Installers are not code-signed. Windows SmartScreen may show warnings. macOS Gatekeeper may block unsigned apps.
- **Notarization:** macOS builds are not notarized. Right-click and select "Open" on first launch.
- **Local AI:** Not all hardware supports local AI models. Cloud AI providers are available as an alternative.
- **Screen Capture:** Linux screen capture requires PipeWire and xdg-desktop-portal on Wayland.

## Security

- All provider credentials stored in OS-secured credential storage
- IPC communication uses context isolation and disabled Node integration
- Local API binds to loopback interface only
- No credentials stored in renderer-accessible storage
- Updates verified via SHA-512 checksums

## Support

- Documentation: https://veyra-al.vercel.app/docs
- Issues: https://github.com/Mathew-code01/Veyra/issues
- Email: support@veyra.app
