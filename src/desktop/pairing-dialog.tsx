import { createMemo, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlugin } from "@opencode/plugin/gui"
import { renderSVG } from "uqr"
import { TailscaleDesktop, type Pairing } from "./contract.ts"

export function PairingDialog(props: { initial: Pairing }) {
  const ctx = usePlugin()
  const ui = {
    Button: ctx.ui.Button.bind(ctx.ui),
    Dialog: ctx.ui.Dialog.bind(ctx.ui),
  }
  const desktop = ctx.main(TailscaleDesktop)
  const controller = new AbortController()
  const signal = AbortSignal.any([controller.signal, ctx.signal])
  const [state, setState] = createStore({
    pairing: props.initial,
    now: Date.now(),
    refreshing: false,
    copying: false,
    copied: false,
    error: "",
    copyError: "",
  })
  let copiedTimeout: ReturnType<typeof setTimeout> | undefined
  const remaining = () => Math.max(0, Math.ceil((state.pairing.expiresAt - state.now) / 1000))
  const valid = () => remaining() > 0 && !state.error
  const qr = createMemo(() =>
    renderSVG(state.pairing.url, {
      border: 4,
      blackColor: "currentColor",
      whiteColor: "transparent",
    }),
  )

  const refresh = async () => {
    if (state.refreshing) return
    clearTimeout(copiedTimeout)
    setState({ refreshing: true, copied: false, error: "", copyError: "" })
    try {
      const result = await desktop.pair({ address: props.initial.address }, { signal })
      if (signal.aborted) return
      setState({ pairing: result, now: Date.now() })
    } catch (cause) {
      if (signal.aborted) return
      setState("error", cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!signal.aborted) setState("refreshing", false)
    }
  }

  const copy = async () => {
    if (!valid() || state.copying) return
    const url = state.pairing.url
    clearTimeout(copiedTimeout)
    setState({ copying: true, copyError: "" })
    try {
      await ctx.system.copy(url)
      if (signal.aborted || state.pairing.url !== url) return
      setState("copied", true)
      copiedTimeout = setTimeout(() => setState("copied", false), 2000)
    } catch {
      if (!signal.aborted) setState("copyError", ctx.t("pairing.copyError"))
    } finally {
      if (!signal.aborted) setState("copying", false)
    }
  }

  onMount(() => {
    const clock = setInterval(() => {
      setState("now", Date.now())
      if (remaining() === 0 && !state.error) void refresh()
    }, 1000)
    onCleanup(() => clearInterval(clock))
  })
  onCleanup(() => {
    controller.abort()
    clearTimeout(copiedTimeout)
  })

  return (
    <ui.Dialog
      title={ctx.t("pairing.title")}
      description={ctx.t("pairing.description")}
      size="fit"
      footer={
        <div class="opencode-tailscale-pairing-footer">
          <span class="opencode-tailscale-expiry" role="timer" aria-live="off">
            {ctx.t("pairing.expires", {
              time: `${Math.floor(remaining() / 60)}:${String(remaining() % 60).padStart(2, "0")}`,
            })}
          </span>
          <ui.Button variant="ghost" disabled={state.refreshing} onClick={() => void refresh()}>
            {ctx.t("pairing.newCode")}
          </ui.Button>
          <ui.Button
            icon={state.copied ? "check" : "copy"}
            disabled={!valid() || state.copying}
            onClick={() => void copy()}
          >
            {ctx.t(state.copied ? "pairing.copied" : "pairing.copyLink")}
          </ui.Button>
        </div>
      }
    >
      <div class="opencode-tailscale-pairing">
        <Show when={valid()}>
          <div
            class="opencode-tailscale-qr"
            role="img"
            aria-label={ctx.t("pairing.qr")}
            innerHTML={qr()}
          />
        </Show>
        <Show when={!valid()}>
          <Show when={state.error} fallback={<p role="status">{ctx.t("pairing.refreshing")}</p>}>
            <p role="alert" class="opencode-tailscale-error">
              {state.error}
            </p>
          </Show>
        </Show>
        <Show when={state.copyError}>
          <p role="alert" class="opencode-tailscale-error">
            {state.copyError}
          </p>
        </Show>
      </div>
    </ui.Dialog>
  )
}
