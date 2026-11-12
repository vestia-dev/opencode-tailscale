import { Schema } from "effect"

export class PluginError extends Schema.TaggedError<
  PluginError,
  { readonly PluginError: unique symbol }
>()("PluginError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  static from = (cause: unknown): PluginError =>
    cause instanceof PluginError
      ? cause
      : new PluginError({
          message: cause instanceof Error ? cause.message : String(cause),
          cause,
        })
}
