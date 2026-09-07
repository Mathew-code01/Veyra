# Database Design

## Storage

The desktop application uses SQLite with Drizzle as the persistence layer.

## Main entities

```text
Profile
 ├── Experience
 ├── Skill
 ├── Project
 └── Story

Document
 └── indexed content

InterviewSession
 ├── Transcript
 ├── Question
 ├── Answer
 ├── Capture metadata
 └── Metrics
```

## Principles

- stable identifiers;
- consistent timestamps;
- relational structure for structured records;
- repositories instead of raw SQL in UI;
- binary data outside relational tables where appropriate.

## Repository boundary

```text
Domain service
 ↓
Repository
 ↓
Drizzle
 ↓
SQLite
```

## Transactions

Use transactions when multiple records must remain consistent, such as deleting a document and its derived index records.

## Migrations

Schema changes must be versioned. Destructive migrations require explicit review.

## Sensitive data

Encrypt sensitive fields when required by the threat model. Database backups inherit the sensitivity of the source database.

## Retention

Retention jobs remove expired sessions, temporary artifacts, and obsolete indexes according to user settings.

## Concurrency

Database access must not block realtime capture unnecessarily.
