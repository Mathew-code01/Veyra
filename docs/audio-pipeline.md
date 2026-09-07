# Audio Pipeline

## Objective

Convert explicitly authorized audio input into timestamped transcript data.

## Pipeline

```text
Permission
 ↓
Audio device
 ↓
Capture
 ↓
Buffer
 ↓
VAD
 ↓
Normalization
 ↓
Speech recognition
 ↓
Partial transcript
 ↓
Final transcript
 ↓
Conversation processing
```

## Capture

Capture starts only after user authorization and successful permission checks.

## Buffering

Buffers are bounded. If transcription falls behind, backpressure prevents unlimited memory growth.

## VAD

Voice activity detection identifies speech boundaries while tolerating normal pauses.

## Transcription

`TranscriptionEngine` hides local and remote STT implementations.

## Transcript records

Final segments should contain:

- stable ID;
- text;
- start time;
- end time;
- speaker where available;
- confidence where available.

## Partial results

Partial results are provisional and must be reconciled with final segments.

## Privacy

Prefer memory processing. Temporary audio files should be deleted after processing unless the user explicitly enables retention.

## Failure recovery

Handle:

- denied microphone permission;
- disconnected device;
- unsupported format;
- transcription timeout;
- provider outage;
- malformed provider result.

The session should remain recoverable whenever possible.
