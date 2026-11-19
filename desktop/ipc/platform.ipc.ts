import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import type { SecureCredentialStore } from '../../core/security/SecureCredentialStore';
import { IPC_CHANNELS } from '../../shared/constants/events';
import { getMainWindow } from '../main/windowManager';

const SESSION_PROFILE = '__veyra_platform__';
const SESSION_PROVIDER = 'veyra-platform-session-v1';
const INSTALLATION_PROVIDER = 'veyra-platform-installation-v1';
const REQUEST_TIMEOUT_MS = 10_000;

interface PlatformUser { id: string; email: string; emailConfirmed: boolean; }
interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: PlatformUser;
  installationId: string;
  deviceId?: string;
}

interface PlatformIpcOptions {
  credentialStore: SecureCredentialStore;
  baseUrl?: string;
  websiteUrl?: string;
}

function configuredWebsiteUrl(value?: string): string {
  const raw = value?.trim() || (!app.isPackaged ? 'http://127.0.0.1:5173' : '');
  if (!raw) throw new Error('VEYRA Website URL is not configured. Set VEYRA_WEBSITE_URL.');
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('VEYRA Website URL must use HTTPS outside local development.');
  return url.toString().replace(/\/$/, '');
}

function configuredBaseUrl(value?: string): string {
  const raw = value?.trim() || (!app.isPackaged ? 'http://127.0.0.1:3000' : '');
  if (!raw) throw new Error('VEYRA Platform URL is not configured. Set VEYRA_PLATFORM_API_URL.');
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('VEYRA Platform URL must use HTTPS outside local development.');
  }
  return url.toString().replace(/\/$/, '');
}

function assertMainWindow(event: IpcMainInvokeEvent): void {
  const window = getMainWindow();
  if (!window || window.isDestroyed() || window.webContents.id !== event.sender.id || event.sender.isDestroyed()) {
    throw new Error('Platform account request rejected for an untrusted renderer.');
  }
}

function safeUser(value: unknown): PlatformUser {
  if (!value || typeof value !== 'object') throw new Error('Platform returned an invalid account response.');
  const user = value as Record<string, unknown>;
  if (typeof user.id !== 'string' || typeof user.email !== 'string') throw new Error('Platform returned an invalid account response.');
  return { id: user.id, email: user.email, emailConfirmed: user.emailConfirmed === true };
}

function platformName(): 'windows' | 'macos' | 'linux' {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

export function registerPlatformIpc(options: PlatformIpcOptions): () => void {
  const baseUrl = configuredBaseUrl(options.baseUrl);
  const websiteUrl = configuredWebsiteUrl(options.websiteUrl);
  const store = options.credentialStore;
  let cancelBrowserAuth: (() => void) | undefined;

  const readStored = async (): Promise<StoredSession | undefined> => {
    const encoded = await store.getDecryptedCredential(SESSION_PROFILE, SESSION_PROVIDER);
    if (!encoded) return undefined;
    try {
      const value = JSON.parse(encoded) as StoredSession;
      if (!value.accessToken || !value.refreshToken || !value.user?.id || !value.installationId) return undefined;
      return value;
    } catch {
      return undefined;
    }
  };

  const writeStored = (session: StoredSession) => store.storeCredential(SESSION_PROFILE, SESSION_PROVIDER, JSON.stringify(session));

  const request = async <T>(path: string, init: RequestInit = {}, token?: string): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json');
      if (init.body) headers.set('Content-Type', 'application/json');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal });
      const body = await response.json().catch(() => ({})) as Record<string, any>;
      if (!response.ok) {
        const error = new Error(typeof body.error?.message === 'string' ? body.error.message : `Platform request failed (${response.status}).`);
        Object.assign(error, { status: response.status, code: body.error?.code });
        throw error;
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  };

  const installationId = async (): Promise<string> => {
    const existing = await store.getDecryptedCredential(SESSION_PROFILE, INSTALLATION_PROVIDER);
    if (existing) return existing;
    const generated = randomUUID();
    await store.storeCredential(SESSION_PROFILE, INSTALLATION_PROVIDER, generated);
    return generated;
  };

  const refreshIfNeeded = async (session: StoredSession): Promise<StoredSession> => {
    if (session.expiresAt > Date.now() + 60_000) return session;
    const refreshed = await request<{
      accessToken: string; refreshToken: string; expiresIn: number;
    }>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    const next = {
      ...session,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: Date.now() + Math.max(0, refreshed.expiresIn) * 1000,
    };
    await writeStored(next);
    return next;
  };

  const getState = async () => {
    const session = await readStored();
    return {
      authenticated: Boolean(session),
      secureStorageAvailable: store.isSecureStorageAvailable(),
      apiConfigured: Boolean(baseUrl),
      baseUrl,
      user: session?.user,
      deviceId: session?.deviceId,
    };
  };

  const signIn = async (email: unknown, password: unknown) => {
    if (!store.isSecureStorageAvailable()) throw new Error('OS-backed secure storage is unavailable; sign-in is disabled to protect your session.');
    if (typeof email !== 'string' || email.length > 320 || !email.includes('@')) throw new Error('Enter a valid email address.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw new Error('Enter a valid password.');
    const result = await request<{
      accessToken: string; refreshToken: string; expiresIn: number; user: unknown;
    }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
    if (!result.accessToken || !result.refreshToken) throw new Error('Platform did not return a persistent authenticated session.');
    const session: StoredSession = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: Date.now() + Math.max(0, result.expiresIn) * 1000,
      user: safeUser(result.user),
      installationId: await installationId(),
    };
    await writeStored(session);
    return { authenticated: true, user: session.user, deviceId: session.deviceId };
  };

  const browserSignIn = async () => {
    if (!store.isSecureStorageAvailable()) throw new Error('OS-backed secure storage is unavailable; sign-in is disabled to protect your session.');
    const transactionId = randomUUID();
    const pollSecret = randomBytes(32).toString('base64url');
    const pair = generateKeyPairSync('x25519');
    const privateKey = pair.privateKey.export({ format: 'der', type: 'pkcs8' });
    const devicePublicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
    const created = await request<{ transactionId: string; expiresAt: string }>('/api/v1/auth/desktop/transactions', {
      method: 'POST', body: JSON.stringify({ devicePublicKey, pollSecret }),
    });
    const authUrl = new URL('/desktop-auth', websiteUrl);
    authUrl.searchParams.set('transactionId', created.transactionId);
    await shell.openExternal(authUrl.toString());
    const deadline = Math.min(Date.parse(created.expiresAt), Date.now() + 10 * 60_000);
    let cancelled = false;
    cancelBrowserAuth = () => { cancelled = true; };
    try {
      while (Date.now() < deadline) {
        if (cancelled) throw new Error('Sign-in was cancelled. You can try again at any time.');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const status = await request<{ status: string }>(`/api/v1/auth/desktop/transactions/${created.transactionId}/status`, {
          headers: { 'X-Desktop-Auth-Poll-Secret': pollSecret },
        });
        if (status.status === 'cancelled') throw new Error('Sign-in was cancelled in the browser.');
        if (status.status === 'expired') throw new Error('This sign-in request expired. Please try again.');
        if (status.status !== 'authorized') continue;
        const exchanged = await request<{ sessionEnvelope: { version: 1; ephemeralPublicKey: string; iv: string; tag: string; ciphertext: string } }>(
          `/api/v1/auth/desktop/transactions/${created.transactionId}/exchange`,
          { method: 'POST', headers: { 'X-Desktop-Auth-Poll-Secret': pollSecret } },
        );
        const envelope = exchanged.sessionEnvelope;
        if (envelope.version !== 1) throw new Error('Unsupported Desktop sign-in response.');
        const ephemeral = createPublicKey({ key: Buffer.from(envelope.ephemeralPublicKey, 'base64url'), format: 'der', type: 'spki' });
        const shared = diffieHellman({ privateKey: createPrivateKey({ key: privateKey, format: 'der', type: 'pkcs8' }), publicKey: ephemeral });
        const key = Buffer.from(hkdfSync('sha256', shared, Buffer.from(created.transactionId), Buffer.from('veyra-desktop-session-v1'), 32));
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
        const payload = JSON.parse(plaintext) as { accessToken: string; refreshToken: string; expiresAt: number; user: unknown };
        if (!payload.accessToken || !payload.refreshToken || payload.expiresAt <= Date.now()) throw new Error('The browser sign-in session expired. Start again.');
        const identity = await request<{ profile: { id: string; email: string } }>('/api/v1/auth/me', {}, payload.accessToken);
        const claimed = payload.user && typeof payload.user === 'object' ? payload.user as Record<string, unknown> : {};
        const user = safeUser({ ...identity.profile, emailConfirmed: claimed.emailConfirmed === true });
        const session: StoredSession = {
          accessToken: payload.accessToken, refreshToken: payload.refreshToken, expiresAt: payload.expiresAt,
          user, installationId: await installationId(),
        };
        await writeStored(session);
        const registered = await registerDevice();
        const account = await refreshAccount();
        if (account.authorization !== 'authorized') throw new Error(account.authorization === 'revoked' ? 'This Desktop device has been revoked. Remove it from your Website account and register again.' : 'This device is not yet authorized by VEYRA Platform. Try again or check your device limit.');
        return { authenticated: true as const, user, deviceId: registered.deviceId };
      }
      throw new Error('Sign-in timed out. Return to VEYRA Desktop and try again.');
    } catch (error) {
      try { await request(`/api/v1/auth/desktop/transactions/${created.transactionId}`, { method: 'DELETE', headers: { 'X-Desktop-Auth-Poll-Secret': pollSecret } }); } catch { /* transaction expires automatically */ }
      throw error;
    } finally {
      cancelBrowserAuth = undefined;
    }
  };

  const signOut = async () => {
    const session = await readStored();
    try {
      if (session) {
        const current = await refreshIfNeeded(session);
        await request('/api/v1/auth/logout', { method: 'POST' }, current.accessToken);
      }
    } finally {
      store.deleteCredential(SESSION_PROFILE, SESSION_PROVIDER);
    }
    return { authenticated: false };
  };

  const registerDevice = async () => {
    const stored = await readStored();
    if (!stored) throw new Error('Sign in to register this Desktop device.');
    const session = await refreshIfNeeded(stored);
    const result = await request<{ device: { id: string }; deviceCredentialHash?: string }>('/api/v1/devices/register', {
      method: 'POST',
      body: JSON.stringify({
        installationId: session.installationId,
        deviceName: `${os.platform()} desktop`,
        platform: platformName(),
      }),
    }, session.accessToken);
    const next = { ...session, deviceId: result.device.id };
    await writeStored(next);
    return { deviceId: result.device.id };
  };

  const refreshAccount = async () => {
    const stored = await readStored();
    if (!stored) throw new Error('Sign in to load your VEYRA account.');
    const session = await refreshIfNeeded(stored);
    const paths = [
      '/api/v1/auth/me',
      '/api/v1/devices',
      '/api/v1/entitlements',
      '/api/v1/subscriptions/current',
      '/api/v1/credits/balance',
      '/api/v1/usage',
    ];
    const [profile, devices, entitlements, subscription, credits, usage] = await Promise.all(
      paths.map((path) => request<Record<string, any>>(path, {}, session.accessToken)),
    );
    const ownDevice = (devices.devices ?? []).find((device: any) => device.installationId === session.installationId);
    return {
      user: safeUser({ id: profile.profile?.id, email: profile.profile?.email, emailConfirmed: session.user.emailConfirmed }),
      profile: profile.profile,
      devices: devices.devices ?? [],
      currentDevice: ownDevice ?? null,
      entitlements: entitlements.entitlements ?? [],
      subscription: subscription.subscription ?? null,
      credits: credits.balance ?? null,
      usage: usage.records ?? usage.usage ?? [],
      sessionExpiresAt: new Date(session.expiresAt).toISOString(),
      authorization: ownDevice ? (ownDevice.isRevoked ? 'revoked' : ownDevice.isAuthorized ? 'authorized' : 'pending') : 'not_registered',
    };
  };

  const updateProfile = async (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Profile details are invalid.');
    const input = value as Record<string, unknown>;
    const enteredDisplayName = typeof input.displayName === 'string' ? input.displayName.trim() : undefined;
    const displayName = enteredDisplayName || undefined;
    const locale = typeof input.locale === 'string' ? input.locale : undefined;
    if (enteredDisplayName !== undefined && enteredDisplayName.length > 100) throw new Error('Display name must be 100 characters or fewer.');
    if (locale !== undefined && !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)) throw new Error('Choose a supported language.');
    if (displayName === undefined && locale === undefined) throw new Error('Add a profile change before saving.');
    const stored = await readStored();
    if (!stored) throw new Error('Sign in to update your VEYRA account.');
    const session = await refreshIfNeeded(stored);
    await request('/api/v1/auth/me', { method: 'PATCH', body: JSON.stringify({ displayName, locale }) }, session.accessToken);
    return refreshAccount();
  };

  const openWebsite = async (destination: unknown) => {
    const paths: Record<string, string> = { account: '/dashboard/settings', billing: '/dashboard/billing' };
    if (typeof destination !== 'string' || !Object.hasOwn(paths, destination)) throw new Error('Website destination is not available.');
    const url = new URL(paths[destination], websiteUrl);
    await shell.openExternal(url.toString());
    return { opened: true };
  };

  const handlers: Array<[string, (event: IpcMainInvokeEvent, ...args: any[]) => Promise<unknown>]> = [
    [IPC_CHANNELS.PLATFORM_GET_STATE, async (event) => { assertMainWindow(event); return getState(); }],
    [IPC_CHANNELS.PLATFORM_SIGN_IN, async (event, email, password) => { assertMainWindow(event); return signIn(email, password); }],
    [IPC_CHANNELS.PLATFORM_BROWSER_SIGN_IN, async (event) => { assertMainWindow(event); return browserSignIn(); }],
    [IPC_CHANNELS.PLATFORM_CANCEL_BROWSER_SIGN_IN, async (event) => { assertMainWindow(event); cancelBrowserAuth?.(); return { cancelled: Boolean(cancelBrowserAuth) }; }],
    [IPC_CHANNELS.PLATFORM_SIGN_OUT, async (event) => { assertMainWindow(event); return signOut(); }],
    [IPC_CHANNELS.PLATFORM_REGISTER_DEVICE, async (event) => { assertMainWindow(event); return registerDevice(); }],
    [IPC_CHANNELS.PLATFORM_REFRESH_ACCOUNT, async (event) => { assertMainWindow(event); return refreshAccount(); }],
    [IPC_CHANNELS.PLATFORM_UPDATE_PROFILE, async (event, profile) => { assertMainWindow(event); return updateProfile(profile); }],
    [IPC_CHANNELS.PLATFORM_OPEN_WEBSITE, async (event, destination) => { assertMainWindow(event); return openWebsite(destination); }],
  ];

  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler);
  return () => { for (const [channel] of handlers) ipcMain.removeHandler(channel); };
}
