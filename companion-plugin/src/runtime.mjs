import path from "node:path";
import { collectFactorySnapshot, readControlPlaneViews } from "./shared/factory-snapshot.mjs";

function buildRespondable(handler) {
  return async ({ params, respond }) => {
    try {
      const payload = await handler(params);
      respond(true, payload);
    } catch (error) {
      respond(false, undefined, {
        code: "UNAVAILABLE",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export function createControlPlaneRuntime(params) {
  let context = {
    stateDir: undefined,
    workspaceDir: params.config.workspaceDir,
  };
  let latestSnapshot = null;
  let refreshInterval = null;

  function resolveWorkspaceDir() {
    const workspaceDir = params.config.workspaceDir || context.workspaceDir;
    if (!workspaceDir) {
      throw new Error("Vertical Agent Forge workspaceDir is unavailable");
    }
    return workspaceDir;
  }

  function resolveDbPath() {
    if (!context.stateDir) {
      throw new Error("Control-plane stateDir is unavailable");
    }
    return path.join(context.stateDir, "vertical-agent-forge-control-plane", "control-plane.db");
  }

  async function refresh(force = false) {
    if (!params.config.enabled) {
      latestSnapshot = {
        available: false,
        pluginId: params.pluginId,
        pluginVersion: params.pluginVersion,
        generatedAt: new Date().toISOString(),
        message: "Vertical Agent Forge control plane is disabled in plugin config.",
      };
      return latestSnapshot;
    }
    if (latestSnapshot && !force) {
      return latestSnapshot;
    }
    const { snapshot } = collectFactorySnapshot({
      tenantId: params.config.tenantId,
      workspaceDir: resolveWorkspaceDir(),
      stateDir: context.stateDir,
      dbPath: resolveDbPath(),
      fullAuto: params.config.fullAuto,
      killSwitch: params.config.killSwitch,
      connectorConfig: params.config.connectors,
    });
    latestSnapshot = {
      pluginId: params.pluginId,
      pluginVersion: params.pluginVersion,
      ...snapshot,
    };
    return latestSnapshot;
  }

  const service = {
    id: params.pluginId,
    start: async (ctx) => {
      context = {
        stateDir: ctx.stateDir,
        workspaceDir: params.config.workspaceDir || ctx.workspaceDir,
      };
      await refresh(true);
      if (params.config.refreshIntervalMs > 0) {
        refreshInterval = setInterval(() => {
          void refresh(true).catch((error) => {
            params.logger.warn?.(`[vertical-agent-forge-control-plane] refresh failed: ${String(error)}`);
          });
        }, params.config.refreshIntervalMs);
        refreshInterval.unref?.();
      }
    },
    stop: async () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    },
  };

  const gatewayMethods = {
    "vertical-agent-forge.snapshot": buildRespondable(async (paramsRaw) => {
      const force = paramsRaw && typeof paramsRaw === "object" && paramsRaw.force === true;
      return await refresh(force);
    }),
    "vertical-agent-forge.validate": buildRespondable(async () => {
      const snapshot = await refresh(true);
      return snapshot.validator;
    }),
    "vertical-agent-forge.jobs": buildRespondable(async () => {
      await refresh(true);
      return readControlPlaneViews({
        dbPath: resolveDbPath(),
        tenantId: params.config.tenantId,
      }).jobs;
    }),
    "vertical-agent-forge.metrics": buildRespondable(async () => {
      await refresh(true);
      return readControlPlaneViews({
        dbPath: resolveDbPath(),
        tenantId: params.config.tenantId,
      }).metrics;
    }),
    "vertical-agent-forge.connectors": buildRespondable(async () => {
      await refresh(true);
      return readControlPlaneViews({
        dbPath: resolveDbPath(),
        tenantId: params.config.tenantId,
      }).connectors;
    }),
    "vertical-agent-forge.incidents": buildRespondable(async () => {
      await refresh(true);
      return readControlPlaneViews({
        dbPath: resolveDbPath(),
        tenantId: params.config.tenantId,
      }).incidents;
    }),
  };

  return {
    service,
    gatewayMethods,
    refresh,
  };
}
