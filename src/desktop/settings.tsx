import { For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createLatest, usePlugin } from "@opencode/plugin/gui"
import { TailscaleDesktop } from "./contract.ts"
import { PairingDialog } from "./pairing-dialog.tsx"
import { CreateProxyDialog } from "./create-proxy-dialog.tsx"

export function Settings() {
  const ctx = usePlugin()
  const ui = {
    Button: ctx.ui.Button.bind(ctx.ui),
    SettingsLayout: ctx.ui.SettingsLayout.bind(ctx.ui),
    SettingsSection: ctx.ui.SettingsSection.bind(ctx.ui),
    SettingsRow: ctx.ui.SettingsRow.bind(ctx.ui),
  }
  const desktop = ctx.main(TailscaleDesktop)
  const controller = new AbortController()
  const signal = AbortSignal.any([controller.signal, ctx.signal])
  const [state, setState] = createStore({
    request: 1,
    pairing: false,
    error: "",
  })
  const status = createLatest(
    () => state.request,
    (_request, requestSignal) => desktop.status({ signal: requestSignal }),
  )
  const serverAddress = createLatest(
    () => state.request,
    (_request, requestSignal) => desktop.serverAddress({ signal: requestSignal }),
  )
  const proxies = createLatest(
    () => state.request,
    (_request, requestSignal) => desktop.proxies({ signal: requestSignal }),
  )
  const statusError = () =>
    status.error instanceof Error ? status.error.message : String(status.error)
  const statusLabel = () => {
    if (status.loading && status.latest === undefined) return ctx.t("connection.loading")
    if (status.error) return ctx.t("connection.unavailable")
    switch (status.latest?.backend) {
      case "Running":
        return ctx.t("connection.connected")
      case "Stopped":
        return ctx.t("connection.disconnectedStatus")
      case "Starting":
        return ctx.t("connection.starting")
      case "NeedsLogin":
        return ctx.t("connection.needsLogin")
      case "NeedsMachineAuth":
        return ctx.t("connection.needsApproval")
      case "InUseOtherUser":
        return ctx.t("connection.otherUser")
      default:
        return ctx.t("connection.unavailable")
    }
  }

  const pair = async (address: string) => {
    if (state.pairing || status.loading) return
    setState({ pairing: true, error: "" })
    try {
      const initial = await desktop.pair({ address }, { signal })
      if (signal.aborted) return
      ctx.dialogs.open(() => <PairingDialog initial={initial} />)
    } catch (cause) {
      if (!signal.aborted) setState("error", cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!signal.aborted) setState("pairing", false)
    }
  }

  onCleanup(() => controller.abort())

  return (
    <ui.SettingsLayout title={ctx.t("title")} description={ctx.t("description")}>
      <section class="settings-section" aria-labelledby="opencode-tailscale-connection-heading">
        <div class="opencode-tailscale-section-header">
          <h3 id="opencode-tailscale-connection-heading" class="settings-section-title">
            {ctx.t("connection.title")}
          </h3>
          <ui.Button
            variant="neutral"
            disabled={status.loading || serverAddress.loading || proxies.loading || state.pairing}
            onClick={() => setState({ request: state.request + 1, error: "" })}
          >
            {ctx.t("refresh")}
          </ui.Button>
        </div>
        <ui.SettingsSection
          footer={
            <Show when={status.error}>
              <p role="alert" class="opencode-tailscale-error">
                {statusError()}
              </p>
            </Show>
          }
        >
          <ui.SettingsRow id="connection" title={ctx.t("connection.status")}>
            <span role="status">{statusLabel()}</span>
          </ui.SettingsRow>
          <Show when={status.latest?.tailnet || status.latest?.tailnetDomain}>
            <ui.SettingsRow title={ctx.t("connection.tailnet")}>
              <div class="opencode-tailscale-detail">
                <span>{status.latest?.tailnet || status.latest?.tailnetDomain}</span>
                <Show when={status.latest?.tailnet && status.latest?.tailnetDomain}>
                  <bdi dir="ltr" class="opencode-tailscale-detail-secondary">
                    {status.latest?.tailnetDomain}
                  </bdi>
                </Show>
              </div>
            </ui.SettingsRow>
          </Show>
          <Show when={status.latest?.account}>
            <ui.SettingsRow title={ctx.t("connection.account")}>
              <bdi class="opencode-tailscale-detail">{status.latest?.account}</bdi>
            </ui.SettingsRow>
          </Show>
          <Show when={status.latest?.device || status.latest?.hostname}>
            <ui.SettingsRow title={ctx.t("connection.device")}>
              <div class="opencode-tailscale-detail">
                <span>{status.latest?.device || status.latest?.hostname}</span>
                <Show when={status.latest?.device && status.latest?.hostname}>
                  <bdi dir="ltr" class="opencode-tailscale-detail-secondary">
                    {status.latest?.hostname}
                  </bdi>
                </Show>
              </div>
            </ui.SettingsRow>
          </Show>
          <Show when={status.latest?.ips.length}>
            <ui.SettingsRow title={ctx.t("connection.ips")}>
              <div class="opencode-tailscale-detail">
                <For each={status.latest?.ips}>{(ip) => <bdi dir="ltr">{ip}</bdi>}</For>
              </div>
            </ui.SettingsRow>
          </Show>
          <ui.SettingsRow id="server-address" title={ctx.t("connection.server")}>
            <bdi dir="ltr" class="opencode-tailscale-detail opencode-tailscale-url">
              {serverAddress.loading && serverAddress.latest === undefined
                ? ctx.t("connection.loading")
                : serverAddress.error
                  ? ctx.t("connection.unavailable")
                  : (serverAddress.latest ?? ctx.t("connection.unavailable"))}
            </bdi>
          </ui.SettingsRow>
        </ui.SettingsSection>
      </section>
      <section class="settings-section" aria-labelledby="opencode-tailscale-proxies-heading">
        <div class="flex flex-col gap-1">
          <div class="opencode-tailscale-section-header">
            <h3 id="opencode-tailscale-proxies-heading" class="settings-section-title">
              {ctx.t("proxy.title")}
            </h3>
            <ui.Button
              variant="neutral"
              disabled={
                status.loading ||
                !!status.error ||
                !status.latest?.connected ||
                !status.latest?.hostname ||
                serverAddress.loading ||
                !!serverAddress.error ||
                !serverAddress.latest ||
                state.pairing
              }
              onClick={() => {
                const address = serverAddress.latest
                const hostname = status.latest?.hostname
                if (!address || !hostname) return
                ctx.dialogs.open((dialog) => (
                  <CreateProxyDialog
                    hostname={hostname}
                    serverAddress={address}
                    onCreated={() => setState({ request: state.request + 1, error: "" })}
                    onClose={() => dialog.close()}
                  />
                ))
              }}
            >
              {ctx.t("proxy.create")}
            </ui.Button>
          </div>
          <span class="text-11-regular text-v2-text-text-muted">{ctx.t("proxy.description")}</span>
        </div>
        <Show
          when={proxies.latest?.length}
          fallback={
            <p
              role="status"
              class="opencode-tailscale-proxy-empty text-13-regular text-v2-text-text-muted"
            >
              {ctx.t(
                proxies.loading && proxies.latest === undefined
                  ? "connection.loading"
                  : proxies.error
                    ? "connection.unavailable"
                    : "proxy.empty",
              )}
            </p>
          }
        >
          <ui.SettingsSection>
            <For each={proxies.latest}>
              {(proxy, index) => (
                <ui.SettingsRow
                  id={index() === 0 ? "proxies" : undefined}
                  title={
                    <bdi dir="ltr" class="opencode-tailscale-url">
                      {proxy.url}
                    </bdi>
                  }
                  description={<Show when={!proxy.canPair}>{ctx.t("pair.unsupported")}</Show>}
                >
                  <ui.Button
                    variant="neutral"
                    disabled={
                      !proxy.canPair ||
                      status.loading ||
                      proxies.loading ||
                      !!proxies.error ||
                      state.pairing ||
                      !!status.error ||
                      !status.latest?.connected
                    }
                    onClick={() => void pair(proxy.url)}
                  >
                    {ctx.t("pair.button")}
                  </ui.Button>
                </ui.SettingsRow>
              )}
            </For>
          </ui.SettingsSection>
        </Show>
        <Show when={state.error || proxies.error}>
          <p role="alert" class="opencode-tailscale-error">
            {state.error ||
              (proxies.error instanceof Error ? proxies.error.message : String(proxies.error))}
          </p>
        </Show>
      </section>
    </ui.SettingsLayout>
  )
}
