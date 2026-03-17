import { resolveControlPlanePluginConfig } from "./src/config.mjs";
import { createControlPlaneRuntime } from "./src/runtime.mjs";

const plugin = {
  id: "vertical-agent-forge-control-plane",
  name: "Vertical Agent Forge Control Plane",
  description: "Runtime control plane, validators, metrics, and connector diagnostics for Vertical Agent Forge",
  configSchema: undefined,
  register(api) {
    const config = resolveControlPlanePluginConfig(api.pluginConfig);
    const runtime = createControlPlaneRuntime({
      config,
      logger: api.logger,
      pluginId: "vertical-agent-forge-control-plane",
      pluginVersion: api.version ?? "0.3.0",
    });

    api.registerService(runtime.service);
    for (const [method, handler] of Object.entries(runtime.gatewayMethods)) {
      api.registerGatewayMethod(method, handler);
    }
  },
};

export default plugin;
