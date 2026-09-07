// desktop/main/appLifecycle.ts

import { app } from "electron";

let initialized = false;

export async function initializeApplication(): Promise<void> {
  if (initialized) {
    return;
  }

  initialized = true;

  configureApplication();

  await initializeApplicationServices();
}

export async function shutdownApplication(): Promise<void> {
  if (!initialized) {
    return;
  }

  try {
    await shutdownApplicationServices();
  } catch (error) {
    console.error("[Veyra] Application shutdown encountered an error.", error);
  } finally {
    initialized = false;
  }
}

function configureApplication(): void {
  app.setName("Veyra");

  if (process.platform === "win32") {
    app.setAppUserModelId("com.veyra.desktop");
  }
}

async function initializeApplicationServices(): Promise<void> {
  /*
   * Future production initialization order:
   *
   * 1. App paths
   * 2. Logger
   * 3. Secure credential store
   * 4. Database
   * 5. Provider health monitor
   * 6. IPC services
   * 7. Tray
   * 8. Global shortcuts
   * 9. Update service
   *
   * Keep expensive work out of the React renderer.
   */

  return Promise.resolve();
}

async function shutdownApplicationServices(): Promise<void> {
  /*
   * Future shutdown order:
   *
   * 1. Stop active sessions
   * 2. Stop audio capture
   * 3. Stop screen capture
   * 4. Flush metrics
   * 5. Close database
   * 6. Clear temporary files
   * 7. Stop background services
   */

  return Promise.resolve();
}
