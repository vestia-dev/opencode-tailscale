import { onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Schema } from "effect"
import { usePlugin } from "@opencode/plugin/gui"
import { ServePort } from "../tailscale/serve.ts"
import { TailscaleDesktop } from "./contract.ts"

export function CreateProxyDialog(props: {
  hostname: string
  serverAddress: string
  onCreated: () => void
  onClose: () => void
}) {
  const ctx = usePlugin()
  const ui = {
    Dialog: ctx.ui.Dialog.bind(ctx.ui),
    TextInput: ctx.ui.TextInput.bind(ctx.ui),
    Button: ctx.ui.Button.bind(ctx.ui),
    Icon: ctx.ui.Icon.bind(ctx.ui),
    Switch: ctx.ui.Switch.bind(ctx.ui),
  }
  const desktop = ctx.main(TailscaleDesktop)
  const controller = new AbortController()
  const signal = AbortSignal.any([controller.signal, ctx.signal])
  const defaultPort = () => new URL(props.serverAddress).port || "80"
  const [state, setState] = createStore({
    port: defaultPort(),
    changePort: false,
    creating: false,
    error: "",
  })
  const valid = () => Schema.is(ServePort)(Number(state.port))
  const deviceUrl = () =>
    `https://${props.hostname}${valid() && Number(state.port) !== 443 ? `:${Number(state.port)}` : ""}`

  const create = async () => {
    if (state.creating || !valid()) return
    setState({ creating: true, error: "" })
    try {
      await desktop.createProxy({ port: Number(state.port) }, { signal })
      if (signal.aborted) return
      props.onCreated()
      props.onClose()
    } catch (cause) {
      if (!signal.aborted) setState("error", cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!signal.aborted) setState("creating", false)
    }
  }

  onCleanup(() => controller.abort())

  return (
    <ui.Dialog
      title={ctx.t("proxy.create")}
      description={ctx.t("proxy.createDescription")}
      footer={
        <>
          <ui.Button variant="neutral" disabled={state.creating} onClick={() => props.onClose()}>
            {ctx.t("proxy.cancel")}
          </ui.Button>
          <ui.Button
            variant="contrast"
            disabled={state.creating || !valid()}
            onClick={() => void create()}
          >
            {ctx.t("proxy.create")}
          </ui.Button>
        </>
      }
    >
      <div class="flex flex-col gap-4">
        <div class="opencode-tailscale-section-header">
          <span class="text-13-regular text-v2-text-text-base">{ctx.t("proxy.changePort")}</span>
          <ui.Switch
            label={ctx.t("proxy.changePort")}
            hideLabel
            checked={state.changePort}
            disabled={state.creating}
            onChange={(changePort) => setState({ changePort, port: defaultPort(), error: "" })}
          />
        </div>
        <Show when={state.changePort}>
          <label class="flex flex-col gap-2">
            <span class="settings-server-dialog-label">{ctx.t("proxy.port")}</span>
            <ui.TextInput
              label={ctx.t("proxy.port")}
              size="large"
              value={state.port}
              disabled={state.creating}
              invalid={!valid()}
              autofocus
              onInput={(port) => setState({ port, error: "" })}
              onSubmit={() => void create()}
            />
          </label>
          <Show when={!valid()}>
            <p role="alert" class="opencode-tailscale-error">
              {ctx.t("proxy.invalidPort")}
            </p>
          </Show>
        </Show>
        <div class="opencode-tailscale-proxy-route text-13-regular">
          <div class="flex flex-col gap-1">
            <span class="text-14-medium text-v2-text-text-base">{ctx.t("proxy.yourDevice")}</span>
            <bdi dir="ltr" class="opencode-tailscale-url text-v2-text-text-muted">
              {deviceUrl()}
            </bdi>
          </div>
          <ui.Icon name="arrow-down-to-line" size="large" class="text-v2-text-text-muted" />
          <div class="flex flex-col gap-1">
            <span class="text-14-medium text-v2-text-text-base">{ctx.t("connection.server")}</span>
            <bdi dir="ltr" class="opencode-tailscale-url text-v2-text-text-muted">
              {props.serverAddress}
            </bdi>
          </div>
        </div>
        <Show when={state.error}>
          <p role="alert" class="opencode-tailscale-error">
            {state.error}
          </p>
        </Show>
      </div>
    </ui.Dialog>
  )
}
