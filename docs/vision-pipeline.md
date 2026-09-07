# Vision Pipeline

## Objective

Analyze user-authorized visual input such as coding problems, diagrams, documents, charts, and screenshots.

## Pipeline

```text
User action
 ↓
OS-supported capture/file selection
 ↓
Image validation
 ↓
Resize/compress
 ↓
OCR
 ↓
Content classification
 ↓
Vision provider
 ↓
Structured result
```

## Input validation

Validate image type, dimensions, byte size, and decodeability before processing.

## Preprocessing

Where appropriate:

- remove unnecessary metadata;
- resize oversized images;
- compress;
- normalize orientation;
- reject malformed input.

## OCR

OCR output is untrusted extracted data.

## Classification

Possible categories:

- code;
- document;
- diagram;
- chart;
- UI;
- unknown.

Classification is advisory and should not control privileged operations.

## Authorization

Visual capture is explicit and user-controlled. The system does not implement hidden or stealth screen capture.

## Privacy

Images are temporary by default. Persistent storage requires an explicit user action or setting.
