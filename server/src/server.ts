import type { Server } from "node:http";
import { createServerApp } from "./app.js";
import type { ServerDependencies } from "./controlPlane.js";

export function startServer(
  dependencies: ServerDependencies,
  port = Number(process.env.PORT ?? 3000),
): Server {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Server port must be a valid TCP port.");
  }

  const server = createServerApp(dependencies).listen(port);
  server.on("error", (error) => {
    console.error("[Veyra API] Server listener failed.", error.message);
  });
  return server;
}