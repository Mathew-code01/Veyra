# Desktop Release Process

## Stages

1. Development
2. Internal validation
3. Release candidate
4. Production release
5. Monitoring

## Pre-release checklist

- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Tests pass
- [ ] Production build passes
- [ ] Installer launches
- [ ] Version is correct
- [ ] Assets are packaged
- [ ] Permissions work
- [ ] Credentials are secure
- [ ] Database migrations are tested
- [ ] Temporary data cleanup works
- [ ] Update configuration is correct
- [ ] Release notes are ready

## Packaging

Electron Builder creates platform-specific artifacts. Production distribution should use platform-appropriate signing.

## Windows

Validate install, upgrade, uninstall, signed binaries, and preservation of user data.

## macOS

Validate signing, notarization, permissions, entitlements, install, upgrade, and uninstall.

## Updates

Update packages must be authenticated and integrity-checked.

## Rollback

Keep previous release artifacts available and define a process for stopping a faulty rollout.

## Versioning

Use semantic versioning where practical:

- MAJOR — incompatible changes;
- MINOR — compatible features;
- PATCH — fixes.

## CI/CD

Release automation should:

1. check out a tag;
2. install locked dependencies;
3. lint;
4. typecheck;
5. test;
6. build;
7. package;
8. sign;
9. publish.

Signing and publishing secrets belong in CI secret storage.
