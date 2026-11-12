import { Schema } from "effect"
import { PluginError } from "../error.ts"

const JsonObject = Schema.Record(Schema.String, Schema.Unknown)

export const ServePort = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))

function object(value: unknown): typeof JsonObject.Type {
  if (value === undefined || value === null) return {}
  if (!Schema.is(JsonObject)(value)) {
    throw new PluginError({ message: "Tailscale returned an unexpected configuration." })
  }
  return value
}

export function localTarget(address: string): string {
  const url = new URL(address)
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(url.hostname)
  ) {
    throw new PluginError({ message: "Expected an HTTP OpenCode server on this computer." })
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new PluginError({
      message: "Expected an OpenCode server address without credentials or a path.",
    })
  }
  return `http://127.0.0.1:${url.port || "80"}`
}

export function tailnetHostname(value: string): string {
  const hostname = value.replace(/\.$/, "").toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.ts\.net$/.test(hostname)) {
    throw new PluginError({
      message: "Tailscale hostname unavailable. Check MagicDNS.",
    })
  }
  return hostname
}

function configurations(config: typeof JsonObject.Type): (typeof JsonObject.Type)[] {
  return [config, ...Object.values(object(config.Foreground)).map(object)]
}

function pointsTo(proxy: unknown, target: string): boolean {
  if (typeof proxy !== "string") return false
  try {
    return localTarget(proxy) === target
  } catch {
    return false
  }
}

export function existingServeUrl(
  raw: unknown,
  hostname: string,
  target: string,
  selected: string,
): string | undefined {
  const config = object(raw)
  for (const scope of configurations(config)) {
    for (const [address, entry] of Object.entries(object(scope.Web))) {
      const [host, port] = address.split(":")
      if (host !== hostname || !/^\d+$/.test(port ?? "")) continue
      const url = `https://${hostname}${port === "443" ? "" : `:${port}`}`
      if (selected !== url) continue
      const root = object(object(object(entry).Handlers)["/"])
      if (!pointsTo(root.Proxy, target)) continue
      if (object(object(scope.TCP)[port]).HTTPS !== true) continue
      if (
        object(config.AllowFunnel)[address] === true ||
        object(scope.AllowFunnel)[address] === true
      ) {
        throw new PluginError({
          message: "Funnel is enabled for this proxy. Disable Funnel to pair.",
        })
      }
      return url
    }
  }
  return undefined
}

export function serveProxies(raw: unknown, target: string) {
  const config = object(raw)
  const proxies = new Map<string, { url: string; canPair: boolean }>()
  for (const scope of configurations(config)) {
    for (const [address, entry] of Object.entries(object(scope.Web))) {
      const port = new URL(`http://${address}`).port || "80"
      const listener = object(object(scope.TCP)[port])
      const protocol =
        listener.HTTPS === true ? "https" : listener.HTTP === true ? "http" : undefined
      if (!protocol) continue
      for (const [path, handler] of Object.entries(object(object(entry).Handlers))) {
        const proxy = object(handler).Proxy
        const destination = typeof proxy === "string" ? URL.parse(proxy) : null
        if (!destination || !pointsTo(destination.origin, target)) continue
        const url = new URL(`${protocol}://${address}`)
        url.pathname = path
        const addressUrl = url.pathname === "/" ? url.origin : url.href
        const funnel =
          object(config.AllowFunnel)[address] === true ||
          object(scope.AllowFunnel)[address] === true
        const canPair = protocol === "https" && path === "/" && pointsTo(proxy, target) && !funnel
        const previous = proxies.get(addressUrl)
        proxies.set(addressUrl, {
          url: addressUrl,
          canPair: canPair && (previous?.canPair ?? true),
        })
      }
    }
  }
  return [...proxies.values()]
}

export function assertServePortAvailable(raw: unknown, port: number): void {
  for (const scope of configurations(object(raw))) {
    const occupied =
      Object.hasOwn(object(scope.TCP), String(port)) ||
      Object.keys(object(scope.Web)).some(
        (address) => address.split(":").at(-1) === String(port),
      ) ||
      Object.entries(object(scope.AllowFunnel)).some(
        ([address, enabled]) => enabled === true && address.split(":").at(-1) === String(port),
      )
    if (occupied) {
      throw new PluginError({
        message: `Port ${port} is already configured in Tailscale. Choose another port.`,
      })
    }
  }
}

export function pairingUrl(origin: string, code: string): string {
  const url = new URL(origin)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new PluginError({ message: "Expected a private Tailscale HTTPS address." })
  }
  tailnetHostname(url.hostname)
  if (!code) throw new PluginError({ message: "OpenCode returned an empty pairing code." })
  return `${url.origin}/auth/connect/${encodeURIComponent(code)}`
}
