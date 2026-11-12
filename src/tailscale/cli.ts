import { execFile } from "node:child_process"
import { access } from "node:fs/promises"
import { constants } from "node:fs"
import { join } from "node:path"
import { promisify } from "node:util"
import { Effect, Option, Schema } from "effect"
import { PluginError } from "../error.ts"
import { parseStatus } from "./status.ts"

const decodeCommandFailure = Schema.decodeUnknownOption(
  Schema.Struct({
    stderr: Schema.optional(Schema.String),
    killed: Schema.optional(Schema.Boolean),
  }),
)

export const findExecutable = Effect.tryPromise({
  try: async () => {
    const candidates =
      process.platform === "darwin"
        ? [
            "/usr/local/bin/tailscale",
            "/opt/homebrew/bin/tailscale",
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
          ]
        : process.platform === "win32"
          ? [join(process.env.ProgramFiles || "C:\\Program Files", "Tailscale", "tailscale.exe")]
          : ["/usr/bin/tailscale", "/usr/local/bin/tailscale"]
    for (const directory of (process.env.PATH || "")
      .split(process.platform === "win32" ? ";" : ":")
      .filter(Boolean)) {
      candidates.push(join(directory, process.platform === "win32" ? "tailscale.exe" : "tailscale"))
    }
    for (const candidate of new Set(candidates)) {
      const executable = await access(candidate, constants.X_OK).then(
        () => true,
        () => false,
      )
      if (executable) return candidate
    }
    throw new PluginError({
      message: "Tailscale not found. Check your installation.",
    })
  },
  catch: PluginError.from,
})

export function command(executable: string, args: string[]) {
  return Effect.tryPromise({
    try: async (signal) => {
      const result = await promisify(execFile)(executable, args, {
        env: { ...process.env, TAILSCALE_BE_CLI: "1" },
        encoding: "utf8",
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
        signal,
        windowsHide: true,
      })
      return result.stdout
    },
    catch: (cause) => {
      const error = Option.getOrUndefined(decodeCommandFailure(cause))
      const message = error?.stderr?.trim()
      return new PluginError({
        message: error?.killed
          ? "Tailscale took too long to respond."
          : message || "Could not contact Tailscale. Check that it is running.",
        cause,
      })
    },
  })
}

export function jsonCommand(executable: string, args: string[]) {
  return command(executable, args).pipe(
    Effect.flatMap((text) =>
      Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(text).pipe(
        Effect.mapError(
          (cause) =>
            new PluginError({
              message: "Tailscale returned an unreadable response.",
              cause,
            }),
        ),
      ),
    ),
  )
}

export const inspectTailscale = Effect.gen(function* () {
  const executable = yield* findExecutable
  const raw = yield* jsonCommand(executable, ["status", "--json", "--peers=false"])
  const status = yield* Effect.try({
    try: () => parseStatus(raw),
    catch: (cause) =>
      new PluginError({
        message: "Tailscale returned an unsupported status response.",
        cause,
      }),
  })
  return { executable, ...status }
})
