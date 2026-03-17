const DEFAULT_CONNECTOR_MODE = "simulate";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function asPositiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeMode(value) {
  return value === "live" ? "live" : DEFAULT_CONNECTOR_MODE;
}

export function resolveControlPlanePluginConfig(raw) {
  const cfg = asObject(raw);
  const connectors = asObject(cfg.connectors);
  return {
    enabled: asBoolean(cfg.enabled, true),
    tenantId: asString(cfg.tenantId, "default"),
    workspaceDir: asString(cfg.workspaceDir, undefined),
    fullAuto: asBoolean(cfg.fullAuto, true),
    killSwitch: asBoolean(cfg.killSwitch, false),
    refreshIntervalMs: asPositiveInt(cfg.refreshIntervalMs, 60_000),
    connectors: {
      zendesk: {
        mode: normalizeMode(asObject(connectors.zendesk).mode),
      },
      stripe: {
        mode: normalizeMode(asObject(connectors.stripe).mode),
      },
      filesystem: {
        mode: normalizeMode(asObject(connectors.filesystem).mode),
      },
    },
  };
}
