import type { DatabaseSync } from "node:sqlite";
import type {
  BrainMeeting,
  BrainMeetingMessage,
  BrandBrain,
  BrandDataroomDoc,
  Client,
  CostLedgerEntry,
  Feedback,
  MarketplaceSkill,
  MasterCase,
  MemberActivityEntry,
  MemberQuota,
  RampUpConfig,
  TeamMember,
  Output,
  PendingPromptChange,
  Playbook,
  RuntimeSnapshot,
  SkillManifest,
  Task,
  TaskStatus,
  TierRule,
  TraceLog,
  Wallet,
  WalletTransaction,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowExecutionStep
} from "@shuangyun/shared-types";
import { parseJson, stringifyJson } from "../database/json.js";

function countTable(database: DatabaseSync, tableName: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as { count: number };
  return row.count;
}

export class ClientRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(client: Client): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO clients (
          client_id, name, industry, created_at, status, google_form_url, google_sheet_id, dataroom_path, subscription_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        client.clientId,
        client.name,
        client.industry,
        client.createdAt,
        client.status,
        client.googleFormUrl,
        client.googleSheetId,
        client.dataroomPath,
        stringifyJson(client.subscription)
      );
  }

  list(): Client[] {
    return this.database
      .prepare("SELECT * FROM clients ORDER BY created_at DESC")
      .all()
      .map((row) => ({
        clientId: row.client_id as string,
        name: row.name as string,
        industry: row.industry as string,
        createdAt: row.created_at as string,
        status: row.status as Client["status"],
        googleFormUrl: (row.google_form_url as string | null) ?? null,
        googleSheetId: (row.google_sheet_id as string | null) ?? null,
        dataroomPath: row.dataroom_path as string,
        subscription: parseJson<Client["subscription"]>(row.subscription_json as string)
      }));
  }

  getById(clientId: string): Client | null {
    const row = this.database.prepare("SELECT * FROM clients WHERE client_id = ?").get(clientId);
    if (!row) {
      return null;
    }

    return {
      clientId: row.client_id as string,
      name: row.name as string,
      industry: row.industry as string,
      createdAt: row.created_at as string,
      status: row.status as Client["status"],
      googleFormUrl: (row.google_form_url as string | null) ?? null,
      googleSheetId: (row.google_sheet_id as string | null) ?? null,
      dataroomPath: row.dataroom_path as string,
      subscription: parseJson<Client["subscription"]>(row.subscription_json as string)
    };
  }
}

export class BrandBrainRepository {
  constructor(private readonly database: DatabaseSync) {}

  save(brandBrain: BrandBrain): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO brand_brains (
          brain_id, client_id, strategy_notes_json, agents_json, dataroom_path, version, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        brandBrain.brainId,
        brandBrain.clientId,
        stringifyJson(brandBrain.strategyNotes),
        stringifyJson(brandBrain.agents),
        brandBrain.dataroomPath,
        brandBrain.version,
        brandBrain.lastUpdated
      );

    for (const agent of Object.values(brandBrain.agents)) {
      this.database
        .prepare(
          `INSERT OR REPLACE INTO agents (
            agent_id, brain_id, role, system_prompt, dataroom_refs_json, responsibilities_json
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          agent.agentId,
          brandBrain.brainId,
          agent.role,
          agent.systemPrompt,
          stringifyJson(agent.dataroomRefs),
          stringifyJson(agent.responsibilities)
        );
    }
  }

  getByClientId(clientId: string): BrandBrain | null {
    const row = this.database.prepare("SELECT * FROM brand_brains WHERE client_id = ?").get(clientId);
    if (!row) {
      return null;
    }

    return {
      brainId: row.brain_id as string,
      clientId: row.client_id as string,
      strategyNotes: parseJson<BrandBrain["strategyNotes"]>(row.strategy_notes_json as string),
      agents: parseJson<BrandBrain["agents"]>(row.agents_json as string),
      dataroomPath: row.dataroom_path as string,
      version: Number(row.version),
      lastUpdated: row.last_updated as string
    };
  }
}

export class BrandDataroomRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(document: BrandDataroomDoc): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO brand_dataroom (
          id, client_id, doc_type, filename, content, content_length, truncated, uploaded_at, uploaded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        document.id,
        document.clientId,
        document.docType,
        document.filename,
        document.content,
        document.contentLength,
        document.truncated ? 1 : 0,
        document.uploadedAt,
        document.uploadedBy
      );
  }

  listByClientId(clientId: string): BrandDataroomDoc[] {
    return this.database
      .prepare("SELECT * FROM brand_dataroom WHERE client_id = ? ORDER BY uploaded_at DESC, id DESC")
      .all(clientId)
      .map((row) => mapBrandDataroomRow(row as Record<string, unknown>));
  }

  getByClientAndType(clientId: string, docType: BrandDataroomDoc["docType"]): BrandDataroomDoc[] {
    return this.database
      .prepare(
        `SELECT * FROM brand_dataroom
         WHERE client_id = ? AND doc_type = ?
         ORDER BY uploaded_at DESC, id DESC`
      )
      .all(clientId, docType)
      .map((row) => mapBrandDataroomRow(row as Record<string, unknown>));
  }

  deleteByClient(clientId: string): number {
    const result = this.database.prepare("DELETE FROM brand_dataroom WHERE client_id = ?").run(clientId);
    return Number(result.changes);
  }
}

function mapBrandDataroomRow(row: Record<string, unknown>): BrandDataroomDoc {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    docType: row.doc_type as BrandDataroomDoc["docType"],
    filename: row.filename as string,
    content: row.content as string,
    contentLength: Number(row.content_length),
    truncated: Number(row.truncated) === 1,
    uploadedAt: row.uploaded_at as string,
    uploadedBy: row.uploaded_by as string
  };
}

export class SkillRepository {
  constructor(private readonly database: DatabaseSync) {}

  save(skill: SkillManifest): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO skills (
          skill_id, name, kind, category, version, description, input_schema_json, output_schema_json, blocks_json, is_shared
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        skill.skillId,
        skill.name,
        skill.kind,
        skill.category,
        skill.version,
        skill.description,
        stringifyJson(skill.inputSchema),
        stringifyJson(skill.outputSchema),
        stringifyJson(skill.blocks),
        skill.isShared ? 1 : 0
      );
  }

  findById(skillId: string): SkillManifest | null {
    const row = this.database.prepare("SELECT * FROM skills WHERE skill_id = ?").get(skillId);
    if (!row) {
      return null;
    }

    return {
      skillId: row.skill_id as string,
      name: row.name as string,
      kind: row.kind as SkillManifest["kind"],
      category: row.category as SkillManifest["category"],
      version: row.version as string,
      description: row.description as string,
      inputSchema: parseJson<SkillManifest["inputSchema"]>(row.input_schema_json as string),
      outputSchema: parseJson<SkillManifest["outputSchema"]>(row.output_schema_json as string),
      blocks: parseJson<SkillManifest["blocks"]>(row.blocks_json as string),
      isShared: Number(row.is_shared) === 1
    };
  }

  list(): SkillManifest[] {
    return this.database.prepare("SELECT * FROM skills ORDER BY name ASC").all().map((row) => ({
      skillId: row.skill_id as string,
      name: row.name as string,
      kind: row.kind as SkillManifest["kind"],
      category: row.category as SkillManifest["category"],
      version: row.version as string,
      description: row.description as string,
      inputSchema: parseJson<SkillManifest["inputSchema"]>(row.input_schema_json as string),
      outputSchema: parseJson<SkillManifest["outputSchema"]>(row.output_schema_json as string),
      blocks: parseJson<SkillManifest["blocks"]>(row.blocks_json as string),
      isShared: Number(row.is_shared) === 1
    }));
  }

  delete(skillId: string): void {
    this.database.prepare("DELETE FROM skills WHERE skill_id = ?").run(skillId);
  }
}

export class SkillReferenceRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(record: { skillId: string; filename: string; content: string; updatedAt: string }): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO skill_references (
          skill_id, filename, content, updated_at
        ) VALUES (?, ?, ?, ?)`
      )
      .run(record.skillId, record.filename, record.content, record.updatedAt);
  }

  listBySkillId(skillId: string): Array<{ skillId: string; filename: string; content: string; updatedAt: string }> {
    return this.database
      .prepare("SELECT * FROM skill_references WHERE skill_id = ? ORDER BY filename ASC")
      .all(skillId)
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          skillId: r.skill_id as string,
          filename: r.filename as string,
          content: r.content as string,
          updatedAt: r.updated_at as string
        };
      });
  }

  deleteBySkillId(skillId: string): void {
    this.database.prepare("DELETE FROM skill_references WHERE skill_id = ?").run(skillId);
  }
}

export class SkillSyncStateRepository {
  constructor(private readonly database: DatabaseSync) {}

  markSynced(record: { skillId: string; source: string; sourceRef: string | null; syncedAt: string }): void {
    this.database
      .prepare(
        `INSERT INTO skill_sync_state (
          skill_id, source, source_ref, synced_at, archived_at
        ) VALUES (?, ?, ?, ?, NULL)
        ON CONFLICT(skill_id, source) DO UPDATE SET
          source_ref = excluded.source_ref,
          synced_at = excluded.synced_at,
          archived_at = NULL`
      )
      .run(record.skillId, record.source, record.sourceRef, record.syncedAt);
  }

  listActiveSkillIds(source: string): string[] {
    return this.database
      .prepare("SELECT skill_id FROM skill_sync_state WHERE source = ? AND archived_at IS NULL ORDER BY skill_id ASC")
      .all(source)
      .map((row) => (row as Record<string, unknown>).skill_id as string);
  }

  archive(skillId: string, source: string, archivedAt: string): void {
    this.database
      .prepare("UPDATE skill_sync_state SET archived_at = ? WHERE skill_id = ? AND source = ?")
      .run(archivedAt, skillId, source);
  }
}

export class TaskRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(task: Task): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO tasks (
          task_id, client_id, title, type, skill_id, status, created_by, created_at, due_at, completed_at, assignee, progress, result_form_row_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        task.taskId,
        task.clientId,
        task.title,
        task.type,
        task.skillId,
        task.status,
        task.createdBy,
        task.createdAt,
        task.dueAt,
        task.completedAt,
        task.assignee,
        task.progress,
        task.resultFormRowId
      );
  }

  listByClient(clientId: string): Task[] {
    return this.database
      .prepare("SELECT * FROM tasks WHERE client_id = ? ORDER BY created_at DESC")
      .all(clientId)
      .map(mapTaskRow);
  }

  listAll(): Task[] {
    return this.database.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all().map(mapTaskRow);
  }

  getById(taskId: string): Task | null {
    const row = this.database.prepare("SELECT * FROM tasks WHERE task_id = ?").get(taskId);
    return row ? mapTaskRow(row as Record<string, unknown>) : null;
  }

  markOverdue(referenceIso: string): number {
    const result = this.database
      .prepare(
        `UPDATE tasks
         SET status = 'overdue'
         WHERE due_at IS NOT NULL
           AND due_at < ?
           AND status IN ('pending', 'in_progress')`
      )
      .run(referenceIso);
    return Number(result.changes);
  }

  completeTask(taskId: string, completedAt: string, resultFormRowId: string | null): void {
    this.database
      .prepare(
        `UPDATE tasks
         SET status = 'done',
             completed_at = ?,
             progress = 100,
             result_form_row_id = ?
         WHERE task_id = ?`
      )
      .run(completedAt, resultFormRowId, taskId);
  }
}

function mapTaskRow(row: Record<string, unknown>): Task {
  return {
    taskId: row.task_id as string,
    clientId: row.client_id as string,
    title: row.title as string,
    type: row.type as Task["type"],
    skillId: row.skill_id as string,
    status: row.status as TaskStatus,
    createdBy: row.created_by as Task["createdBy"],
    createdAt: row.created_at as string,
    dueAt: (row.due_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    assignee: (row.assignee as string | null) ?? null,
    progress: Number(row.progress),
    resultFormRowId: (row.result_form_row_id as string | null) ?? null
  };
}

export class OutputRepository {
  constructor(private readonly database: DatabaseSync) {}

  save(output: Output): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO outputs (
          output_id, task_id, client_id, type, title, content_body, asset_urls_json, skill_used, review_json, status, form_row_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        output.outputId,
        output.taskId,
        output.clientId,
        output.type,
        output.title,
        output.contentBody,
        stringifyJson(output.assetUrls),
        output.skillUsed,
        output.review ? stringifyJson(output.review) : null,
        output.status,
        output.formRowId,
        output.createdAt
      );
  }

  listByClient(clientId: string): Output[] {
    return this.database
      .prepare("SELECT * FROM outputs WHERE client_id = ? ORDER BY created_at DESC")
      .all(clientId)
      .map(mapOutputRow);
  }

  getById(outputId: string): Output | null {
    const row = this.database.prepare("SELECT * FROM outputs WHERE output_id = ?").get(outputId);
    return row ? mapOutputRow(row as Record<string, unknown>) : null;
  }
}

function mapOutputRow(row: Record<string, unknown>): Output {
  return {
    outputId: row.output_id as string,
    taskId: row.task_id as string,
    clientId: row.client_id as string,
    type: row.type as Output["type"],
    title: row.title as string,
    contentBody: row.content_body as string,
    assetUrls: parseJson<Output["assetUrls"]>(row.asset_urls_json as string),
    skillUsed: row.skill_used as string,
    review: row.review_json ? parseJson<Output["review"]>(row.review_json as string) : null,
    status: row.status as Output["status"],
    formRowId: (row.form_row_id as string | null) ?? null,
    createdAt: row.created_at as string
  };
}

export class FeedbackRepository {
  constructor(private readonly database: DatabaseSync) {}

  exists(feedbackId: string): boolean {
    const row = this.database.prepare("SELECT 1 AS found FROM feedbacks WHERE feedback_id = ?").get(feedbackId);
    return Boolean(row);
  }

  save(feedback: Feedback): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO feedbacks (
          feedback_id, client_id, output_id, submitted_by, feedback_type, content, submitted_at, applied_to_brain
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        feedback.feedbackId,
        feedback.clientId,
        feedback.outputId,
        feedback.submittedBy,
        feedback.feedbackType,
        feedback.content,
        feedback.submittedAt,
        feedback.appliedToBrain ? 1 : 0
      );
  }

  upsert(feedback: Feedback): boolean {
    const existed = this.exists(feedback.feedbackId);
    this.save(feedback);
    return !existed;
  }
}

export class TraceRepository {
  constructor(private readonly database: DatabaseSync) {}

  save(trace: TraceLog): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO traces (
          trace_id, task_id, client_id, phase, step_name, input_summary, output_summary, started_at, ended_at, error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        trace.traceId,
        trace.taskId,
        trace.clientId,
        trace.phase,
        trace.stepName,
        trace.inputSummary,
        trace.outputSummary,
        trace.startedAt,
        trace.endedAt,
        trace.errorCode
      );
  }

  listByTaskId(taskId: string): TraceLog[] {
    return this.database
      .prepare("SELECT * FROM traces WHERE task_id = ? ORDER BY started_at ASC")
      .all(taskId)
      .map((row) => ({
        traceId: row.trace_id as string,
        taskId: (row.task_id as string | null) ?? null,
        clientId: (row.client_id as string | null) ?? null,
        phase: row.phase as TraceLog["phase"],
        stepName: row.step_name as string,
        inputSummary: row.input_summary as string,
        outputSummary: row.output_summary as string,
        startedAt: row.started_at as string,
        endedAt: (row.ended_at as string | null) ?? null,
        errorCode: (row.error_code as string | null) ?? null
      }));
  }
}

export class PendingPromptChangeRepository {
  constructor(private readonly database: DatabaseSync) {}

  save(change: PendingPromptChange): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO pending_prompt_changes (
          change_id, brain_id, requested_by, current_version, proposed_prompt, rationale, created_at, approved_at, approved_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        change.changeId,
        change.brainId,
        change.requestedBy,
        change.currentVersion,
        change.proposedPrompt,
        change.rationale,
        change.createdAt,
        change.approvedAt,
        change.approvedBy
      );
  }
}

export class TeamMemberRepository {
  constructor(private readonly database: DatabaseSync) {}

  upsert(member: TeamMember): void {
    const existing = this.getByAlias(member.alias);
    const notes = existing?.notes ?? member.notes;
    const joinedAt = existing?.joinedAt ?? member.joinedAt;
    this.database
      .prepare(
        `INSERT OR REPLACE INTO team_members (
          member_id, alias, display_name, role, email, status, joined_at, last_seen_at, notes_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        member.memberId,
        member.alias,
        member.displayName,
        member.role,
        member.email,
        member.status,
        joinedAt,
        member.lastSeenAt,
        stringifyJson(notes)
      );
  }

  getByAlias(alias: string): TeamMember | null {
    const row = this.database.prepare("SELECT * FROM team_members WHERE alias = ?").get(alias);
    return row ? mapTeamMemberRow(row as Record<string, unknown>) : null;
  }

  getById(memberId: string): TeamMember | null {
    const row = this.database.prepare("SELECT * FROM team_members WHERE member_id = ?").get(memberId);
    return row ? mapTeamMemberRow(row as Record<string, unknown>) : null;
  }

  listAll(): TeamMember[] {
    return this.database.prepare("SELECT * FROM team_members ORDER BY alias ASC").all().map((row) => mapTeamMemberRow(row as Record<string, unknown>));
  }

  updateStatus(memberId: string, status: TeamMember["status"]): void {
    this.database.prepare("UPDATE team_members SET status = ? WHERE member_id = ?").run(status, memberId);
  }

  appendNote(memberId: string, note: TeamMember["notes"][number]): TeamMember | null {
    const member = this.getById(memberId);
    if (!member) {
      return null;
    }
    const notes = [...member.notes, note];
    this.database.prepare("UPDATE team_members SET notes_json = ? WHERE member_id = ?").run(stringifyJson(notes), memberId);
    return {
      ...member,
      notes
    };
  }
}

function mapTeamMemberRow(row: Record<string, unknown>): TeamMember {
  return {
    memberId: row.member_id as string,
    alias: row.alias as string,
    displayName: row.display_name as string,
    role: row.role as TeamMember["role"],
    email: (row.email as string | null) ?? null,
    status: row.status as TeamMember["status"],
    joinedAt: row.joined_at as string,
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
    notes: parseJson<TeamMember["notes"]>((row.notes_json as string | null) ?? "[]")
  };
}

export class MemberQuotaRepository {
  constructor(private readonly database: DatabaseSync) {}

  upsert(quota: MemberQuota): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO member_quotas (
          member_id, daily_usd, weekly_usd, monthly_usd, task_count_daily_target, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        quota.memberId,
        quota.dailyUsd,
        quota.weeklyUsd,
        quota.monthlyUsd,
        quota.taskCountDailyTarget,
        quota.updatedAt,
        quota.updatedBy
      );
  }

  getByMemberId(memberId: string): MemberQuota | null {
    const row = this.database.prepare("SELECT * FROM member_quotas WHERE member_id = ?").get(memberId);
    return row ? mapMemberQuotaRow(row as Record<string, unknown>) : null;
  }

  listAll(): MemberQuota[] {
    return this.database.prepare("SELECT * FROM member_quotas ORDER BY member_id ASC").all().map((row) => mapMemberQuotaRow(row as Record<string, unknown>));
  }
}

function mapMemberQuotaRow(row: Record<string, unknown>): MemberQuota {
  return {
    memberId: row.member_id as string,
    dailyUsd: row.daily_usd === null ? null : Number(row.daily_usd),
    weeklyUsd: row.weekly_usd === null ? null : Number(row.weekly_usd),
    monthlyUsd: row.monthly_usd === null ? null : Number(row.monthly_usd),
    taskCountDailyTarget: row.task_count_daily_target === null ? null : Number(row.task_count_daily_target),
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string
  };
}

export class MemberActivityRepository {
  constructor(private readonly database: DatabaseSync) {}

  listByMemberId(
    memberId: string,
    filters: {
      since?: string;
      skillId?: string;
      verdict?: string;
      limit?: number;
    } = {}
  ): MemberActivityEntry[] {
    const clauses = ["member_id = ?"];
    const params: Array<string | number> = [memberId];
    if (filters.since) {
      clauses.push("started_at >= ?");
      params.push(filters.since);
    }
    if (filters.skillId) {
      clauses.push("skill_id = ?");
      params.push(filters.skillId);
    }
    if (filters.verdict) {
      clauses.push("verdict = ?");
      params.push(filters.verdict);
    }
    const limit = filters.limit ?? 100;
    params.push(limit);
    return this.database
      .prepare(
        `SELECT * FROM member_activity_log
         WHERE ${clauses.join(" AND ")}
         ORDER BY started_at DESC
         LIMIT ?`
      )
      .all(...params)
      .map((row) => mapMemberActivityRow(row as Record<string, unknown>));
  }

  getByTaskId(taskId: string): MemberActivityEntry[] {
    return this.database
      .prepare("SELECT * FROM member_activity_log WHERE task_id = ? ORDER BY started_at DESC")
      .all(taskId)
      .map((row) => mapMemberActivityRow(row as Record<string, unknown>));
  }
}

function mapMemberActivityRow(row: Record<string, unknown>): MemberActivityEntry {
  return {
    memberId: row.member_id as string,
    alias: row.alias as string,
    taskId: row.task_id as string,
    skillId: row.skill_id as string,
    clientId: row.client_id as string,
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string | null) ?? null,
    verdict: (row.verdict as MemberActivityEntry["verdict"]) ?? null,
    status: row.status as MemberActivityEntry["status"],
    estimatedUsd: Number(row.estimated_usd ?? 0),
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    contentPreview: (row.content_preview as string | null) ?? ""
  };
}

export class CostLedgerRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(entry: CostLedgerEntry & { id: string; memberId?: string | null; taskId?: string | null }): void {
    this.database
      .prepare(
        `INSERT INTO cost_ledger (
          id, date, actor_alias, action, estimated_usd, model, input_tokens, output_tokens, created_at, member_id, task_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.date,
        entry.actorAlias,
        entry.action,
        entry.estimatedUsd,
        entry.model,
        entry.inputTokens,
        entry.outputTokens,
        entry.createdAt,
        entry.memberId ?? null,
        entry.taskId ?? null
      );
  }

  getTotalByDate(date: string): number {
    const row = this.database.prepare("SELECT COALESCE(SUM(estimated_usd), 0) AS total FROM cost_ledger WHERE date = ?").get(date) as {
      total: number;
    };
    return Number(row.total ?? 0);
  }

  getMemberDailyTotal(memberId: string, date: string): number {
    const row = this.database
      .prepare("SELECT COALESCE(SUM(estimated_usd), 0) AS total FROM cost_ledger WHERE member_id = ? AND date = ?")
      .get(memberId, date) as {
      total: number;
    };
    return Number(row.total ?? 0);
  }
}

export class WalletRepository {
  constructor(private readonly database: DatabaseSync) {}

  upsert(wallet: Wallet): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO member_wallets (
          member_id, balance, lifetime_earned, lifetime_spent, tier, tier_updated_at, last_grant_at,
          last_daily_bonus_at, current_streak_days, last_streak_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        wallet.memberId,
        wallet.balance,
        wallet.lifetimeEarned,
        wallet.lifetimeSpent,
        wallet.tier,
        wallet.tierUpdatedAt,
        wallet.lastGrantAt,
        wallet.lastDailyBonusAt,
        wallet.currentStreakDays,
        wallet.lastStreakDate,
        wallet.createdAt,
        wallet.updatedAt
      );
  }

  getByMemberId(memberId: string): Wallet | null {
    const row = this.database.prepare("SELECT * FROM member_wallets WHERE member_id = ?").get(memberId);
    return row ? mapWalletRow(row as Record<string, unknown>) : null;
  }

  updateBalance(memberId: string, balance: number, updatedAt: string): void {
    this.database.prepare("UPDATE member_wallets SET balance = ?, updated_at = ? WHERE member_id = ?").run(balance, updatedAt, memberId);
  }

  incrementLifetime(
    memberId: string,
    updates: {
      earnedDelta?: number;
      spentDelta?: number;
      updatedAt: string;
      lastGrantAt?: string | null;
      lastDailyBonusAt?: string | null;
    }
  ): void {
    this.database
      .prepare(
        `UPDATE member_wallets
         SET lifetime_earned = lifetime_earned + ?,
             lifetime_spent = lifetime_spent + ?,
             last_grant_at = COALESCE(?, last_grant_at),
             last_daily_bonus_at = COALESCE(?, last_daily_bonus_at),
             updated_at = ?
         WHERE member_id = ?`
      )
      .run(
        updates.earnedDelta ?? 0,
        updates.spentDelta ?? 0,
        updates.lastGrantAt ?? null,
        updates.lastDailyBonusAt ?? null,
        updates.updatedAt,
        memberId
      );
  }

  updateTier(memberId: string, tier: Wallet["tier"], tierUpdatedAt: string): void {
    this.database
      .prepare("UPDATE member_wallets SET tier = ?, tier_updated_at = ?, updated_at = ? WHERE member_id = ?")
      .run(tier, tierUpdatedAt, tierUpdatedAt, memberId);
  }

  updateStreak(
    memberId: string,
    streak: {
      currentStreakDays: number;
      lastStreakDate: string | null;
      lastDailyBonusAt?: string | null;
      updatedAt: string;
    }
  ): void {
    this.database
      .prepare(
        `UPDATE member_wallets
         SET current_streak_days = ?,
             last_streak_date = ?,
             last_daily_bonus_at = COALESCE(?, last_daily_bonus_at),
             updated_at = ?
         WHERE member_id = ?`
      )
      .run(streak.currentStreakDays, streak.lastStreakDate, streak.lastDailyBonusAt ?? null, streak.updatedAt, memberId);
  }
}

function mapWalletRow(row: Record<string, unknown>): Wallet {
  return {
    memberId: row.member_id as string,
    balance: Number(row.balance ?? 0),
    lifetimeEarned: Number(row.lifetime_earned ?? 0),
    lifetimeSpent: Number(row.lifetime_spent ?? 0),
    tier: row.tier as Wallet["tier"],
    tierUpdatedAt: row.tier_updated_at as string,
    lastGrantAt: (row.last_grant_at as string | null) ?? null,
    lastDailyBonusAt: (row.last_daily_bonus_at as string | null) ?? null,
    currentStreakDays: Number(row.current_streak_days ?? 0),
    lastStreakDate: (row.last_streak_date as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

export class WalletTransactionRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(transaction: WalletTransaction): void {
    this.database
      .prepare(
        `INSERT INTO wallet_transactions (
          tx_id, member_id, amount, type, reason, ref_task_id, multiplier, original_amount, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        transaction.txId,
        transaction.memberId,
        transaction.amount,
        transaction.type,
        transaction.reason,
        transaction.refTaskId,
        transaction.multiplier,
        transaction.originalAmount,
        transaction.createdAt,
        transaction.createdBy
      );
  }

  listByMemberId(
    memberId: string,
    filters: {
      since?: string;
      type?: WalletTransaction["type"];
      limit?: number;
    } = {}
  ): WalletTransaction[] {
    const clauses = ["member_id = ?"];
    const params: Array<string | number> = [memberId];
    if (filters.since) {
      clauses.push("created_at >= ?");
      params.push(filters.since);
    }
    if (filters.type) {
      clauses.push("type = ?");
      params.push(filters.type);
    }
    params.push(filters.limit ?? 100);
    return this.database
      .prepare(
        `SELECT * FROM wallet_transactions
         WHERE ${clauses.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(...params)
      .map((row) => mapWalletTransactionRow(row as Record<string, unknown>));
  }

  getTodaySpend(memberId: string, datePrefix: string): number {
    const row = this.database
      .prepare(
        `SELECT COALESCE(SUM(ABS(amount)), 0) AS total
         FROM wallet_transactions
         WHERE member_id = ? AND type = 'spend_dispatch' AND substr(created_at, 1, 10) = ?`
      )
      .get(memberId, datePrefix) as { total: number };
    return Number(row.total ?? 0);
  }

  getMonthlyEarn(memberId: string, monthPrefix: string): number {
    const row = this.database
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM wallet_transactions
         WHERE member_id = ? AND amount > 0 AND substr(created_at, 1, 7) = ?`
      )
      .get(memberId, monthPrefix) as { total: number };
    return Number(row.total ?? 0);
  }

  getWeeklyEarn(memberId: string, since: string): number {
    const row = this.database
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM wallet_transactions
         WHERE member_id = ? AND amount > 0 AND created_at >= ?`
      )
      .get(memberId, since) as { total: number };
    return Number(row.total ?? 0);
  }
}

function mapWalletTransactionRow(row: Record<string, unknown>): WalletTransaction {
  return {
    txId: row.tx_id as string,
    memberId: row.member_id as string,
    amount: Number(row.amount ?? 0),
    type: row.type as WalletTransaction["type"],
    reason: row.reason as string,
    refTaskId: (row.ref_task_id as string | null) ?? null,
    multiplier: Number(row.multiplier ?? 1),
    originalAmount: Number(row.original_amount ?? 0),
    createdAt: row.created_at as string,
    createdBy: row.created_by as string
  };
}

export class TierRulesRepository {
  constructor(private readonly database: DatabaseSync) {}

  listAll(): TierRule[] {
    return this.database
      .prepare("SELECT * FROM tier_rules ORDER BY threshold ASC")
      .all()
      .map((row) => mapTierRuleRow(row as Record<string, unknown>));
  }

  getByTier(tier: TierRule["tier"]): TierRule | null {
    const row = this.database.prepare("SELECT * FROM tier_rules WHERE tier = ?").get(tier);
    return row ? mapTierRuleRow(row as Record<string, unknown>) : null;
  }

  upsert(rule: TierRule): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO tier_rules (
          tier, threshold, daily_cap, icon, display_name, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(rule.tier, rule.threshold, rule.dailyCap, rule.icon, rule.displayName, rule.updatedAt, rule.updatedBy);
  }
}

function mapTierRuleRow(row: Record<string, unknown>): TierRule {
  return {
    tier: row.tier as TierRule["tier"],
    threshold: Number(row.threshold ?? 0),
    dailyCap: Number(row.daily_cap ?? 0),
    icon: row.icon as string,
    displayName: row.display_name as string,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string
  };
}

export class RampUpRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(config: RampUpConfig): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO ramp_up_config (
          id, start_date, end_date, multiplier, reason, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(config.id, config.startDate, config.endDate, config.multiplier, config.reason, config.createdAt, config.createdBy);
  }

  getCurrentActive(now = new Date().toISOString()): RampUpConfig | null {
    const row = this.database
      .prepare(
        `SELECT * FROM ramp_up_config
         WHERE start_date <= ? AND end_date >= ?
         ORDER BY start_date DESC
         LIMIT 1`
      )
      .get(now, now);
    return row ? mapRampUpRow(row as Record<string, unknown>) : null;
  }

  listAll(): RampUpConfig[] {
    return this.database
      .prepare("SELECT * FROM ramp_up_config ORDER BY start_date DESC")
      .all()
      .map((row) => mapRampUpRow(row as Record<string, unknown>));
  }
}

function mapRampUpRow(row: Record<string, unknown>): RampUpConfig {
  return {
    id: row.id as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    multiplier: Number(row.multiplier ?? 1),
    reason: row.reason as string,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string
  };
}

export class MasterCaseRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(masterCase: MasterCase): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO master_cases (
          case_id, industry, channel, summary, brief, what_worked, what_failed, takeaway, tags_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        masterCase.caseId,
        masterCase.industry,
        masterCase.channel,
        masterCase.summary,
        masterCase.brief,
        masterCase.whatWorked,
        masterCase.whatFailed,
        masterCase.takeaway,
        stringifyJson(masterCase.tags),
        masterCase.createdAt
      );
  }

  getById(caseId: string): MasterCase | null {
    const row = this.database.prepare("SELECT * FROM master_cases WHERE case_id = ?").get(caseId);
    return row ? mapMasterCaseRow(row as Record<string, unknown>) : null;
  }

  listByIndustry(industry: string): MasterCase[] {
    return this.database
      .prepare("SELECT * FROM master_cases WHERE industry = ? ORDER BY created_at DESC")
      .all(industry)
      .map((row) => mapMasterCaseRow(row as Record<string, unknown>));
  }

  listByTags(tags: string[], limit = 20): MasterCase[] {
    if (tags.length === 0) {
      return [];
    }

    const placeholders = tags.map(() => "?").join(", ");
    return this.database
      .prepare(
        `SELECT DISTINCT mc.*
         FROM master_cases mc, json_each(mc.tags_json) tag
         WHERE tag.value IN (${placeholders})
         ORDER BY mc.created_at DESC
         LIMIT ?`
      )
      .all(...tags, limit)
      .map((row) => mapMasterCaseRow(row as Record<string, unknown>));
  }

  listAll(): MasterCase[] {
    return this.database.prepare("SELECT * FROM master_cases ORDER BY created_at DESC").all().map((row) => mapMasterCaseRow(row as Record<string, unknown>));
  }
}

function mapMasterCaseRow(row: Record<string, unknown>): MasterCase {
  return {
    caseId: row.case_id as string,
    industry: row.industry as string,
    channel: row.channel as string,
    summary: row.summary as string,
    brief: row.brief as string,
    whatWorked: row.what_worked as string,
    whatFailed: (row.what_failed as string | null) ?? null,
    takeaway: row.takeaway as string,
    tags: parseJson<MasterCase["tags"]>(row.tags_json as string),
    createdAt: row.created_at as string
  };
}

export class PlaybookRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(playbook: Playbook): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO playbooks (
          playbook_id, name, applicable_when_json, steps_json, expected_outcomes_json, notes
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        playbook.playbookId,
        playbook.name,
        stringifyJson(playbook.applicableWhen),
        stringifyJson(playbook.steps),
        stringifyJson(playbook.expectedOutcomes),
        playbook.notes
      );
  }

  getById(playbookId: string): Playbook | null {
    const row = this.database.prepare("SELECT * FROM playbooks WHERE playbook_id = ?").get(playbookId);
    return row ? mapPlaybookRow(row as Record<string, unknown>) : null;
  }

  listAll(): Playbook[] {
    return this.database.prepare("SELECT * FROM playbooks ORDER BY name ASC").all().map((row) => mapPlaybookRow(row as Record<string, unknown>));
  }

  findApplicable(taskAttrs: Record<string, string | string[]>): Playbook[] {
    return this.listAll().filter((playbook) =>
      Object.entries(playbook.applicableWhen).every(([key, expectedValue]) => {
        const actualValue = taskAttrs[key];
        if (actualValue === undefined) {
          return false;
        }

        if (Array.isArray(expectedValue)) {
          const actualValues = Array.isArray(actualValue) ? actualValue : [actualValue];
          return expectedValue.every((value) => actualValues.includes(value));
        }

        if (Array.isArray(actualValue)) {
          return actualValue.includes(expectedValue);
        }

        return actualValue === expectedValue;
      })
    );
  }
}

function mapPlaybookRow(row: Record<string, unknown>): Playbook {
  return {
    playbookId: row.playbook_id as string,
    name: row.name as string,
    applicableWhen: parseJson<Playbook["applicableWhen"]>(row.applicable_when_json as string),
    steps: parseJson<Playbook["steps"]>(row.steps_json as string),
    expectedOutcomes: parseJson<Playbook["expectedOutcomes"]>(row.expected_outcomes_json as string),
    notes: (row.notes as string | null) ?? null
  };
}

/* ───────── Brain Meeting Repositories ───────── */

export class BrainMeetingRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(meeting: BrainMeeting): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO brain_meetings (
          meeting_id, task_id, client_id, mode, status, started_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        meeting.meetingId,
        meeting.taskId ?? null,
        meeting.clientId,
        meeting.mode,
        meeting.status,
        meeting.startedAt,
        meeting.endedAt ?? null
      );
  }

  updateStatus(meetingId: string, status: string, endedAt?: string): void {
    this.database
      .prepare("UPDATE brain_meetings SET status = ?, ended_at = ? WHERE meeting_id = ?")
      .run(status, endedAt ?? null, meetingId);
  }

  getById(meetingId: string): BrainMeeting | null {
    const row = this.database.prepare("SELECT * FROM brain_meetings WHERE meeting_id = ?").get(meetingId);
    if (!row) return null;
    const r = row as Record<string, unknown>;
    return {
      meetingId: r.meeting_id as string,
      taskId: (r.task_id as string | null) ?? undefined,
      clientId: r.client_id as string,
      mode: r.mode as BrainMeeting["mode"],
      status: r.status as BrainMeeting["status"],
      startedAt: r.started_at as string,
      endedAt: (r.ended_at as string | null) ?? undefined
    };
  }
}

export class BrainMeetingMessageRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(msg: BrainMeetingMessage): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO brain_meeting_messages (
          id, meeting_id, role, round, phase, content, error_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(msg.id, msg.meetingId, msg.role, msg.round, msg.phase, msg.content, msg.errorCode ?? null, msg.createdAt);
  }

  listByMeetingId(meetingId: string): BrainMeetingMessage[] {
    return this.database
      .prepare("SELECT * FROM brain_meeting_messages WHERE meeting_id = ? ORDER BY created_at ASC")
      .all(meetingId)
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string,
          meetingId: r.meeting_id as string,
          role: r.role as BrainMeetingMessage["role"],
          round: r.round as number,
          phase: r.phase as BrainMeetingMessage["phase"],
          content: r.content as string,
          errorCode: (r.error_code as string | null) ?? undefined,
          createdAt: r.created_at as string
        };
      });
  }
}

/* ───────── Marketplace Skill Repository ───────── */

export class MarketplaceSkillRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(skill: MarketplaceSkill): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO marketplace_skills (
          skill_id, publisher_alias, publisher_member_id, category, name, description, prompt_preview, install_count, status, version, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        skill.skillId,
        skill.publisherAlias,
        skill.publisherMemberId ?? null,
        skill.category,
        skill.name,
        skill.description,
        skill.promptPreview ?? null,
        skill.installCount,
        skill.status,
        skill.version,
        skill.publishedAt
      );
  }

  getById(skillId: string): MarketplaceSkill | null {
    const row = this.database.prepare("SELECT * FROM marketplace_skills WHERE skill_id = ?").get(skillId);
    if (!row) return null;
    return mapMarketplaceSkillRow(row as Record<string, unknown>);
  }

  list(opts?: { category?: string; status?: string }): MarketplaceSkill[] {
    let sql = "SELECT * FROM marketplace_skills WHERE 1=1";
    const params: string[] = [];
    if (opts?.category) {
      sql += " AND category = ?";
      params.push(opts.category);
    }
    if (opts?.status) {
      sql += " AND status = ?";
      params.push(opts.status);
    }
    sql += " ORDER BY install_count DESC, published_at DESC";
    return this.database.prepare(sql).all(...params).map(r => mapMarketplaceSkillRow(r as Record<string, unknown>));
  }

  incrementInstalls(skillId: string): void {
    this.database.prepare("UPDATE marketplace_skills SET install_count = install_count + 1 WHERE skill_id = ?").run(skillId);
  }

  delete(skillId: string): void {
    this.database.prepare("DELETE FROM marketplace_skills WHERE skill_id = ?").run(skillId);
  }
}

function mapMarketplaceSkillRow(r: Record<string, unknown>): MarketplaceSkill {
  return {
    skillId: r.skill_id as string,
    publisherAlias: r.publisher_alias as string,
    publisherMemberId: (r.publisher_member_id as string | null) ?? undefined,
    category: r.category as string,
    name: r.name as string,
    description: r.description as string,
    promptPreview: (r.prompt_preview as string | null) ?? undefined,
    installCount: r.install_count as number,
    status: r.status as MarketplaceSkill["status"],
    version: r.version as string,
    publishedAt: r.published_at as string
  };
}

/* ───────── Feedback History ───────── */

export class FeedbackHistoryRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(record: { id: string; clientId: string; skillId: string; taskType: string; outputSummary: string; createdAt: string }): void {
    this.database.prepare(
      `INSERT INTO feedback_history (id, client_id, skill_id, task_type, output_summary, score, user_edits, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(record.id, record.clientId, record.skillId, record.taskType, record.outputSummary, null, null, record.createdAt);
  }

  listRecent(clientId: string, taskType: string, limit = 5): Array<{ id: string; outputSummary: string; score: number | null; userEdits: string | null; createdAt: string }> {
    return this.database.prepare(
      "SELECT * FROM feedback_history WHERE client_id = ? AND task_type = ? ORDER BY created_at DESC LIMIT ?"
    ).all(clientId, taskType, limit).map(row => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        outputSummary: r.output_summary as string,
        score: r.score as number | null,
        userEdits: r.user_edits as string | null,
        createdAt: r.created_at as string
      };
    });
  }

  updateFeedback(id: string, score: number, userEdits: string): void {
    this.database.prepare("UPDATE feedback_history SET score = ?, user_edits = ? WHERE id = ?").run(score, userEdits, id);
  }
}

/* ───────── Workflow Repositories ───────── */

export class WorkflowRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(wf: WorkflowDefinition): void {
    this.database.prepare(
      `INSERT OR REPLACE INTO workflows (workflow_id, name, client_id, nodes_json, edges_json, created_by, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(wf.workflowId, wf.name, wf.clientId, stringifyJson(wf.nodes), stringifyJson(wf.edges), wf.createdBy, wf.version, wf.createdAt, wf.updatedAt);
  }

  getById(workflowId: string): WorkflowDefinition | null {
    const row = this.database.prepare("SELECT * FROM workflows WHERE workflow_id = ?").get(workflowId);
    if (!row) return null;
    const r = row as Record<string, unknown>;
    return {
      workflowId: r.workflow_id as string,
      name: r.name as string,
      clientId: r.client_id as string,
      nodes: parseJson<WorkflowDefinition["nodes"]>(r.nodes_json as string),
      edges: parseJson<WorkflowDefinition["edges"]>(r.edges_json as string),
      createdBy: r.created_by as string,
      version: r.version as number,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string
    };
  }

  list(): WorkflowDefinition[] {
    return this.database.prepare("SELECT * FROM workflows ORDER BY updated_at DESC").all().map(row => {
      const r = row as Record<string, unknown>;
      return {
        workflowId: r.workflow_id as string, name: r.name as string, clientId: r.client_id as string,
        nodes: parseJson<WorkflowDefinition["nodes"]>(r.nodes_json as string),
        edges: parseJson<WorkflowDefinition["edges"]>(r.edges_json as string),
        createdBy: r.created_by as string, version: r.version as number,
        createdAt: r.created_at as string, updatedAt: r.updated_at as string
      };
    });
  }

  update(workflowId: string, patch: Partial<Pick<WorkflowDefinition, "name" | "clientId" | "nodes" | "edges">>): void {
    const existing = this.getById(workflowId);
    if (!existing) return;
    const updated = { ...existing, ...patch, version: existing.version + 1, updatedAt: new Date().toISOString() };
    this.create(updated);
  }

  delete(workflowId: string): void {
    this.database.prepare("DELETE FROM workflows WHERE workflow_id = ?").run(workflowId);
  }
}

export class WorkflowExecutionRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(exec: WorkflowExecution): void {
    this.database.prepare(
      `INSERT INTO workflow_executions (execution_id, workflow_id, status, started_at, ended_at, total_cost_usd)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(exec.executionId, exec.workflowId, exec.status, exec.startedAt, exec.endedAt ?? null, exec.totalCostUsd);
  }

  updateStatus(executionId: string, status: string, endedAt?: string, totalCostUsd?: number): void {
    this.database.prepare(
      "UPDATE workflow_executions SET status = ?, ended_at = ?, total_cost_usd = COALESCE(?, total_cost_usd) WHERE execution_id = ?"
    ).run(status, endedAt ?? null, totalCostUsd ?? null, executionId);
  }

  getById(executionId: string): WorkflowExecution | null {
    const row = this.database.prepare("SELECT * FROM workflow_executions WHERE execution_id = ?").get(executionId);
    if (!row) return null;
    const r = row as Record<string, unknown>;
    return {
      executionId: r.execution_id as string, workflowId: r.workflow_id as string,
      status: r.status as WorkflowExecution["status"], startedAt: r.started_at as string,
      endedAt: (r.ended_at as string | null) ?? undefined, totalCostUsd: r.total_cost_usd as number
    };
  }

  listByWorkflow(workflowId: string): WorkflowExecution[] {
    return this.database.prepare("SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC").all(workflowId).map(row => {
      const r = row as Record<string, unknown>;
      return {
        executionId: r.execution_id as string, workflowId: r.workflow_id as string,
        status: r.status as WorkflowExecution["status"], startedAt: r.started_at as string,
        endedAt: (r.ended_at as string | null) ?? undefined, totalCostUsd: r.total_cost_usd as number
      };
    });
  }

  getLatestByWorkflow(workflowId: string): WorkflowExecution | null {
    const row = this.database.prepare("SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 1").get(workflowId);
    if (!row) return null;
    const r = row as Record<string, unknown>;
    return {
      executionId: r.execution_id as string, workflowId: r.workflow_id as string,
      status: r.status as WorkflowExecution["status"], startedAt: r.started_at as string,
      endedAt: (r.ended_at as string | null) ?? undefined, totalCostUsd: r.total_cost_usd as number
    };
  }
}

export class WorkflowExecutionStepRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(step: WorkflowExecutionStep): void {
    this.database.prepare(
      `INSERT INTO workflow_execution_steps (step_id, execution_id, node_id, status, input_json, output_json, cost_input_tokens, cost_output_tokens, cost_estimated_usd, started_at, ended_at, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(step.stepId, step.executionId, step.nodeId, step.status, step.inputJson, step.outputJson, step.costInputTokens, step.costOutputTokens, step.costEstimatedUsd, step.startedAt, step.endedAt ?? null, step.errorMessage ?? null);
  }

  updateStatus(stepId: string, status: string, outputJson?: string, endedAt?: string, errorMessage?: string, costInputTokens?: number, costOutputTokens?: number, costEstimatedUsd?: number): void {
    this.database.prepare(
      `UPDATE workflow_execution_steps SET status = ?, output_json = COALESCE(?, output_json), ended_at = COALESCE(?, ended_at), error_message = ?, cost_input_tokens = COALESCE(?, cost_input_tokens), cost_output_tokens = COALESCE(?, cost_output_tokens), cost_estimated_usd = COALESCE(?, cost_estimated_usd) WHERE step_id = ?`
    ).run(status, outputJson ?? null, endedAt ?? null, errorMessage ?? null, costInputTokens ?? null, costOutputTokens ?? null, costEstimatedUsd ?? null, stepId);
  }

  listByExecution(executionId: string): WorkflowExecutionStep[] {
    return this.database.prepare("SELECT * FROM workflow_execution_steps WHERE execution_id = ? ORDER BY started_at ASC").all(executionId).map(row => {
      const r = row as Record<string, unknown>;
      return {
        stepId: r.step_id as string, executionId: r.execution_id as string, nodeId: r.node_id as string,
        status: r.status as WorkflowExecutionStep["status"], inputJson: r.input_json as string, outputJson: r.output_json as string,
        costInputTokens: r.cost_input_tokens as number, costOutputTokens: r.cost_output_tokens as number, costEstimatedUsd: r.cost_estimated_usd as number,
        startedAt: r.started_at as string, endedAt: (r.ended_at as string | null) ?? undefined, errorMessage: (r.error_message as string | null) ?? undefined
      };
    });
  }
}

export type RepositoryBundle = {
  clients: ClientRepository;
  brandBrains: BrandBrainRepository;
  brandDataroom: BrandDataroomRepository;
  skills: SkillRepository;
  tasks: TaskRepository;
  outputs: OutputRepository;
  feedbacks: FeedbackRepository;
  traces: TraceRepository;
  pendingPromptChanges: PendingPromptChangeRepository;
  teamMembers: TeamMemberRepository;
  memberQuotas: MemberQuotaRepository;
  memberActivity: MemberActivityRepository;
  wallets: WalletRepository;
  walletTransactions: WalletTransactionRepository;
  tierRules: TierRulesRepository;
  rampUps: RampUpRepository;
  costLedger: CostLedgerRepository;
  masterCases: MasterCaseRepository;
  playbooks: PlaybookRepository;
  brainMeetings: BrainMeetingRepository;
  brainMeetingMessages: BrainMeetingMessageRepository;
  marketplaceSkills: MarketplaceSkillRepository;
  feedbackHistory: FeedbackHistoryRepository;
  skillReferences: SkillReferenceRepository;
  skillSyncState: SkillSyncStateRepository;
  workflows: WorkflowRepository;
  workflowExecutions: WorkflowExecutionRepository;
  workflowExecutionSteps: WorkflowExecutionStepRepository;
  withTransaction: <T>(run: () => T) => T;
  snapshot: () => RuntimeSnapshot;
};

export function createRepositoryBundle(database: DatabaseSync): RepositoryBundle {
  return {
    clients: new ClientRepository(database),
    brandBrains: new BrandBrainRepository(database),
    brandDataroom: new BrandDataroomRepository(database),
    skills: new SkillRepository(database),
    tasks: new TaskRepository(database),
    outputs: new OutputRepository(database),
    feedbacks: new FeedbackRepository(database),
    traces: new TraceRepository(database),
    pendingPromptChanges: new PendingPromptChangeRepository(database),
    teamMembers: new TeamMemberRepository(database),
    memberQuotas: new MemberQuotaRepository(database),
    memberActivity: new MemberActivityRepository(database),
    wallets: new WalletRepository(database),
    walletTransactions: new WalletTransactionRepository(database),
    tierRules: new TierRulesRepository(database),
    rampUps: new RampUpRepository(database),
    costLedger: new CostLedgerRepository(database),
    masterCases: new MasterCaseRepository(database),
    playbooks: new PlaybookRepository(database),
    brainMeetings: new BrainMeetingRepository(database),
    brainMeetingMessages: new BrainMeetingMessageRepository(database),
    marketplaceSkills: new MarketplaceSkillRepository(database),
    feedbackHistory: new FeedbackHistoryRepository(database),
    skillReferences: new SkillReferenceRepository(database),
    skillSyncState: new SkillSyncStateRepository(database),
    workflows: new WorkflowRepository(database),
    workflowExecutions: new WorkflowExecutionRepository(database),
    workflowExecutionSteps: new WorkflowExecutionStepRepository(database),
    withTransaction: <T>(run: () => T): T => {
      database.exec("BEGIN");
      try {
        const result = run();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    snapshot: () => ({
      clients: countTable(database, "clients"),
      brandBrains: countTable(database, "brand_brains"),
      skills: countTable(database, "skills"),
      tasks: countTable(database, "tasks"),
      outputs: countTable(database, "outputs"),
      feedbacks: countTable(database, "feedbacks"),
      traces: countTable(database, "traces"),
      pendingPromptChanges: countTable(database, "pending_prompt_changes")
    })
  };
}
