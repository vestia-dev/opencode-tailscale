import { Plugin, SettingsPage, Style } from "@opencode/plugin/gui"
import { main } from "./desktop/main.ts"
import { Settings } from "./desktop/settings.tsx"
import en from "./desktop/i18n/en.ts"
import css from "./desktop/styles.css?inline"

export default Plugin.define({
  i18n: { en },
  main,
  setup(ctx) {
    ctx.add(Style, css)
    ctx.add(SettingsPage, {
      id: "tailscale",
      get title() {
        return ctx.t("title")
      },
      icon: "dot-grid",
      get entries() {
        return [
          {
            id: "connection",
            title: ctx.t("connection.title"),
            keywords: "tailscale network status tailnet account device ip address",
          },
          {
            id: "server-address",
            title: ctx.t("connection.server"),
            keywords: "opencode local server address port",
          },
          {
            id: "proxies",
            title: ctx.t("proxy.title"),
            keywords: "tailscale serve proxy forwarding url mobile phone qr pairing remote",
          },
        ]
      },
      render: () => <Settings />,
    })
  },
})
