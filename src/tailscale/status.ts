import { Schema } from "effect"

const Status = Schema.Struct({
  BackendState: Schema.String,
  CurrentTailnet: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        Name: Schema.optional(Schema.String),
        MagicDNSSuffix: Schema.optional(Schema.String),
      }),
    ),
  ),
  Self: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        HostName: Schema.optional(Schema.String),
        DNSName: Schema.optional(Schema.String),
        UserID: Schema.optional(Schema.Finite),
        TailscaleIPs: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
      }),
    ),
  ),
  TailscaleIPs: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  User: Schema.optional(
    Schema.NullOr(
      Schema.Record(
        Schema.String,
        Schema.Struct({
          LoginName: Schema.optional(Schema.String),
          DisplayName: Schema.optional(Schema.String),
        }),
      ),
    ),
  ),
})

export function parseStatus(raw: unknown) {
  const status = Schema.decodeUnknownSync(Status)(raw)
  const user =
    status.Self?.UserID === undefined ? undefined : status.User?.[String(status.Self.UserID)]
  return {
    backend: status.BackendState,
    hostname: (status.Self?.DNSName || "").replace(/\.$/, ""),
    device: status.Self?.HostName || "",
    tailnet: status.CurrentTailnet?.Name || "",
    tailnetDomain: status.CurrentTailnet?.MagicDNSSuffix || "",
    account: user?.LoginName || user?.DisplayName || "",
    ips: status.Self?.TailscaleIPs ?? status.TailscaleIPs ?? [],
  }
}
