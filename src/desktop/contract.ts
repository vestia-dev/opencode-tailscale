import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"
import { ServePort } from "../tailscale/serve.ts"

export const ConnectionStatus = Schema.Struct({
  connected: Schema.Boolean,
  backend: Schema.String,
  hostname: Schema.String,
  device: Schema.String,
  tailnet: Schema.String,
  tailnetDomain: Schema.String,
  account: Schema.String,
  ips: Schema.Array(Schema.String),
})

export const Pairing = Schema.Struct({
  url: Schema.String,
  expiresAt: Schema.Finite,
  address: Schema.String,
})

export type Pairing = typeof Pairing.Type

export const TailscaleDesktop = Ipc.define({
  id: "opencode-tailscale.desktop",
  methods: {
    serverAddress: { output: Schema.NullOr(Schema.String) },
    proxies: {
      output: Schema.Array(Schema.Struct({ url: Schema.String, canPair: Schema.Boolean })),
    },
    status: { output: ConnectionStatus },
    createProxy: {
      input: Schema.Struct({ port: ServePort }),
      output: Schema.String,
    },
    pair: {
      input: Schema.Struct({
        address: Schema.String,
      }),
      output: Pairing,
    },
  },
})
