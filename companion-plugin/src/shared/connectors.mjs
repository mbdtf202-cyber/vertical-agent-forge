import path from "node:path";
import { fileExists, readJsonIfExists, resolveWorkspacePaths } from "./workspace.mjs";

function buildSnapshot(params) {
  return {
    connectorId: params.connectorId,
    tenantId: params.tenantId,
    mode: params.mode,
    status: params.status,
    permissionLevel: params.permissionLevel,
    blastRadius: params.blastRadius,
    capabilities: params.capabilities,
    details: params.details,
    checkedAt: new Date().toISOString(),
  };
}

function filesystemKnowledgeSnapshot({ workspaceDir, tenantId, mode }) {
  const paths = resolveWorkspacePaths(workspaceDir);
  const sourceIndex = path.join(paths.compiledDomainDir, "source-index.json");
  return buildSnapshot({
    connectorId: "filesystem",
    tenantId,
    mode,
    status: fileExists(sourceIndex) ? "healthy" : "degraded",
    permissionLevel: "read-only",
    blastRadius: "workspace",
    capabilities: ["knowledge-search", "policy-read", "fixture-read"],
    details: {
      compiledSourceIndexPresent: fileExists(sourceIndex),
      sourceDir: paths.sourceDir,
    },
  });
}

function zendeskSnapshot({ workspaceDir, tenantId, mode, env }) {
  const fixturePath = path.join(resolveWorkspacePaths(workspaceDir).sourceDir, "tickets", "historical-tickets.json");
  const fixture = readJsonIfExists(fixturePath, []);
  const liveTokenPresent = Boolean(env.ZENDESK_API_TOKEN || env.ZENDESK_OAUTH_TOKEN);
  const resolvedMode = mode === "live" && liveTokenPresent ? "live" : "simulate";
  return buildSnapshot({
    connectorId: "zendesk",
    tenantId,
    mode: resolvedMode,
    status: resolvedMode === "live" || Array.isArray(fixture) ? "healthy" : "degraded",
    permissionLevel: resolvedMode === "live" ? "read-write" : "simulated",
    blastRadius: "ticket-comment",
    capabilities: ["ticket-intake", "ticket-update", "ticket-tag", "comment-draft"],
    details: {
      liveTokenPresent,
      fixturePath,
      fixtureCount: Array.isArray(fixture) ? fixture.length : 0,
    },
  });
}

function stripeSnapshot({ workspaceDir, tenantId, mode, env }) {
  const fixturePath = path.join(resolveWorkspacePaths(workspaceDir).sourceDir, "catalog", "plans.json");
  const fixture = readJsonIfExists(fixturePath, { plans: [] });
  const liveKeyPresent = Boolean(env.STRIPE_SECRET_KEY);
  const resolvedMode = mode === "live" && liveKeyPresent ? "live" : "simulate";
  return buildSnapshot({
    connectorId: "stripe",
    tenantId,
    mode: resolvedMode,
    status: resolvedMode === "live" || Array.isArray(fixture.plans) ? "healthy" : "degraded",
    permissionLevel: resolvedMode === "live" ? "read-only" : "simulated",
    blastRadius: "billing-lookup",
    capabilities: ["subscription-lookup", "plan-lookup", "billing-summary"],
    details: {
      liveKeyPresent,
      fixturePath,
      planCount: Array.isArray(fixture.plans) ? fixture.plans.length : 0,
    },
  });
}

export function doctorConnectors({ workspaceDir, tenantId = "default", connectorConfig = {}, env = process.env }) {
  const config = {
    zendesk: { mode: connectorConfig.zendesk?.mode ?? "simulate" },
    stripe: { mode: connectorConfig.stripe?.mode ?? "simulate" },
    filesystem: { mode: connectorConfig.filesystem?.mode ?? "simulate" },
  };

  const snapshots = [
    zendeskSnapshot({ workspaceDir, tenantId, mode: config.zendesk.mode, env }),
    stripeSnapshot({ workspaceDir, tenantId, mode: config.stripe.mode, env }),
    filesystemKnowledgeSnapshot({ workspaceDir, tenantId, mode: config.filesystem.mode }),
  ];
  const hasDegraded = snapshots.some((entry) => entry.status !== "healthy");
  return {
    ok: !hasDegraded,
    checkedAt: new Date().toISOString(),
    snapshots,
  };
}
