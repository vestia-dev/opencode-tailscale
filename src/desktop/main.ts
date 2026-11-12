import { Clock, Effect } from "effect"
import type { Plugin } from "@opencode/plugin/gui"
import { PluginError } from "../error.ts"
import { command, findExecutable, inspectTailscale, jsonCommand } from "../tailscale/cli.ts"
import {
  existingServeUrl,
  assertServePortAvailable,
  localTarget,
  pairingUrl,
  serveProxies,
  tailnetHostname,
} from "../tailscale/serve.ts"
import { TailscaleDesktop } from "./contract.ts"

export const main: Plugin.MainSetup = (ctx) => {
  let pairing = false
  let creating = false

  const backendAddress = () => {
    const endpoint = ctx.serverEndpoints.get("sidecar")
    if (!endpoint?.sameMachine)
      throw new PluginError({
        message: "OpenCode server is not ready.",
      })
    return localTarget(endpoint.url)
  }

  const inspect = Effect.gen(function* () {
    const state = yield* inspectTailscale
    return { ...state, connected: state.backend === "Running" }
  })

  ctx.provide(TailscaleDesktop, {
    serverAddress: async () => {
      const endpoint = ctx.serverEndpoints.get("sidecar")
      if (!endpoint?.sameMachine) return null
      return localTarget(endpoint.url)
    },

    proxies: (_input, caller) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const target = yield* Effect.try({ try: backendAddress, catch: PluginError.from })
          const executable = yield* findExecutable
          const config = yield* jsonCommand(executable, ["serve", "status", "--json"])
          return yield* Effect.try({
            try: () => serveProxies(config, target),
            catch: PluginError.from,
          })
        }),
        { signal: AbortSignal.any([ctx.signal, caller.signal]) },
      ),

    status: (_input, caller) =>
      Effect.runPromise(inspect, {
        signal: AbortSignal.any([ctx.signal, caller.signal]),
      }).then(({ connected, backend, hostname, device, tailnet, tailnetDomain, account, ips }) => ({
        connected,
        backend,
        hostname,
        device,
        tailnet,
        tailnetDomain,
        account,
        ips,
      })),

    createProxy: async ({ port }, caller) => {
      if (creating) throw new PluginError({ message: "Proxy creation is already in progress." })
      creating = true
      try {
        return await Effect.runPromise(
          Effect.gen(function* () {
            const state = yield* inspect
            if (!state.connected) {
              return yield* new PluginError({
                message: "Connect to Tailscale.",
              })
            }
            const target = yield* Effect.try({ try: backendAddress, catch: PluginError.from })
            const hostname = yield* Effect.try({
              try: () => tailnetHostname(state.hostname),
              catch: PluginError.from,
            })
            const config = yield* jsonCommand(state.executable, ["serve", "status", "--json"])
            yield* Effect.try({
              try: () => assertServePortAvailable(config, port),
              catch: PluginError.from,
            })
            yield* command(state.executable, ["serve", "--bg", "--yes", `--https=${port}`, target])
            const updated = yield* jsonCommand(state.executable, ["serve", "status", "--json"])
            const address = `https://${hostname}${port === 443 ? "" : `:${port}`}`
            const confirmed = yield* Effect.try({
              try: () => existingServeUrl(updated, hostname, target, address),
              catch: PluginError.from,
            })
            if (!confirmed) {
              return yield* new PluginError({
                message: "Could not verify the new proxy. Refresh the proxy list.",
              })
            }
            return confirmed
          }),
          { signal: AbortSignal.any([ctx.signal, caller.signal]) },
        )
      } finally {
        creating = false
      }
    },

    pair: async ({ address }, caller) => {
      if (pairing) throw new PluginError({ message: "Pairing is already in progress." })
      pairing = true
      try {
        return await Effect.runPromise(
          Effect.gen(function* () {
            const state = yield* inspect
            if (!state.connected) {
              return yield* new PluginError({
                message: "Connect to Tailscale.",
              })
            }
            const target = yield* Effect.try({ try: backendAddress, catch: PluginError.from })
            const hostname = yield* Effect.try({
              try: () => tailnetHostname(state.hostname),
              catch: PluginError.from,
            })
            const config = yield* jsonCommand(state.executable, ["serve", "status", "--json"])
            const match = yield* Effect.try({
              try: () => existingServeUrl(config, hostname, target, address),
              catch: PluginError.from,
            })
            if (!match)
              return yield* new PluginError({
                message: "This proxy is no longer available. Refresh the proxy list.",
              })
            const code = yield* Effect.tryPromise({
              try: (signal) => ctx.client.server.pair({ signal }),
              catch: (cause) =>
                new PluginError({
                  message: "Could not create a pairing link.",
                  cause,
                }),
            })
            const now = yield* Clock.currentTimeMillis
            const url = yield* Effect.try({
              try: () => pairingUrl(address, code.code),
              catch: PluginError.from,
            })
            return { url, address, expiresAt: now + code.expires_in * 1000 }
          }),
          { signal: AbortSignal.any([ctx.signal, caller.signal]) },
        )
      } finally {
        pairing = false
      }
    },
  })

  ctx.log.write("info", "Tailscale desktop plugin loaded")
}
