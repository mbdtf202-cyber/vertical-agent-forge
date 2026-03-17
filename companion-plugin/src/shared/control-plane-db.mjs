import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function requireNodeSqlite() {
  try {
    return require("node:sqlite");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SQLite support is unavailable in this Node runtime (missing node:sqlite). ${message}`);
  }
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function openControlPlaneDb(dbPath) {
  const { DatabaseSync } = requireNodeSqlite();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  ensureControlPlaneSchema(db);
  return db;
}

export function ensureControlPlaneSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      job_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      case_id TEXT,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      details_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leases (
      lease_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      owner TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS metrics (
      metric_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      labels_json TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connectors (
      connector_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      PRIMARY KEY (connector_id, tenant_id)
    );
    CREATE TABLE IF NOT EXISTS incidents (
      incident_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      case_id TEXT,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS canary_runs (
      release_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      case_id TEXT,
      status TEXT NOT NULL,
      metric_json TEXT NOT NULL,
      observed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_tenant ON metrics(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON incidents(tenant_id);
  `);
}

export function writeControlPlaneSnapshot(db, snapshot) {
  const tenantId = snapshot.tenantId;
  const now = snapshot.generatedAt ?? new Date().toISOString();

  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)").run("last_snapshot_at", now);
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)").run(
    `tenant:${tenantId}:workspaceDir`,
    snapshot.workspaceDir,
  );

  db.prepare("DELETE FROM jobs WHERE tenant_id = ?").run(tenantId);
  db.prepare("DELETE FROM metrics WHERE tenant_id = ?").run(tenantId);
  db.prepare("DELETE FROM connectors WHERE tenant_id = ?").run(tenantId);
  db.prepare("DELETE FROM incidents WHERE tenant_id = ?").run(tenantId);
  db.prepare("DELETE FROM canary_runs WHERE tenant_id = ?").run(tenantId);
  db.prepare("DELETE FROM leases WHERE tenant_id = ?").run(tenantId);

  const insertJob = db.prepare(`
    INSERT INTO jobs(job_id, tenant_id, case_id, stage, status, details_json, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `);
  for (const job of snapshot.jobs ?? []) {
    insertJob.run(
      job.jobId,
      tenantId,
      job.caseId ?? null,
      job.stage,
      job.status,
      json(job),
      job.updatedAt ?? now,
    );
  }

  const insertMetric = db.prepare(`
    INSERT INTO metrics(metric_id, tenant_id, metric_name, value, labels_json, recorded_at)
    VALUES(?, ?, ?, ?, ?, ?)
  `);
  for (const metric of snapshot.metrics ?? []) {
    insertMetric.run(
      metric.metricId,
      tenantId,
      metric.name,
      metric.value,
      json(metric.labels),
      metric.recordedAt ?? now,
    );
  }

  const insertConnector = db.prepare(`
    INSERT INTO connectors(connector_id, tenant_id, mode, status, snapshot_json, checked_at)
    VALUES(?, ?, ?, ?, ?, ?)
  `);
  for (const connector of snapshot.connectors ?? []) {
    insertConnector.run(
      connector.connectorId,
      tenantId,
      connector.mode,
      connector.status,
      json(connector),
      connector.checkedAt ?? now,
    );
  }

  const insertIncident = db.prepare(`
    INSERT INTO incidents(incident_id, tenant_id, case_id, severity, status, trigger, detail_json, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const incident of snapshot.incidents ?? []) {
    insertIncident.run(
      incident.incidentId,
      tenantId,
      incident.caseId ?? null,
      incident.severity,
      incident.status,
      incident.trigger,
      json(incident),
      incident.createdAt ?? now,
    );
  }

  const insertCanary = db.prepare(`
    INSERT INTO canary_runs(release_id, tenant_id, case_id, status, metric_json, observed_at)
    VALUES(?, ?, ?, ?, ?, ?)
  `);
  for (const canary of snapshot.canaries ?? []) {
    insertCanary.run(
      canary.releaseId,
      tenantId,
      canary.caseId ?? null,
      canary.status,
      json(canary.metrics ?? {}),
      canary.observedAt ?? now,
    );
  }

  db.prepare(`
    INSERT INTO leases(lease_id, tenant_id, resource, owner, expires_at)
    VALUES(?, ?, ?, ?, ?)
  `).run(
    `${tenantId}:snapshot-refresh`,
    tenantId,
    "snapshot-refresh",
    "vertical-agent-forge-control-plane",
    new Date(Date.now() + 60_000).toISOString(),
  );
}

export function listJobs(db, tenantId) {
  return db.prepare(`
    SELECT job_id, case_id, stage, status, details_json, updated_at
    FROM jobs
    WHERE tenant_id = ?
    ORDER BY updated_at DESC, job_id DESC
  `).all(tenantId).map((row) => ({
    jobId: row.job_id,
    caseId: row.case_id,
    stage: row.stage,
    status: row.status,
    details: parseJson(row.details_json, {}),
    updatedAt: row.updated_at,
  }));
}

export function listMetrics(db, tenantId) {
  return db.prepare(`
    SELECT metric_id, metric_name, value, labels_json, recorded_at
    FROM metrics
    WHERE tenant_id = ?
    ORDER BY recorded_at DESC, metric_id DESC
  `).all(tenantId).map((row) => ({
    metricId: row.metric_id,
    name: row.metric_name,
    value: row.value,
    labels: parseJson(row.labels_json, {}),
    recordedAt: row.recorded_at,
  }));
}

export function listConnectorSnapshots(db, tenantId) {
  return db.prepare(`
    SELECT snapshot_json
    FROM connectors
    WHERE tenant_id = ?
    ORDER BY connector_id ASC
  `).all(tenantId).map((row) => parseJson(row.snapshot_json, {}));
}

export function listIncidents(db, tenantId) {
  return db.prepare(`
    SELECT detail_json
    FROM incidents
    WHERE tenant_id = ?
    ORDER BY created_at DESC, incident_id DESC
  `).all(tenantId).map((row) => parseJson(row.detail_json, {}));
}
