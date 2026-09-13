import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';
import { AgentRepository } from '../../src/server/repositories/agent-repository.js';
import { AgentRunRepository } from '../../src/server/repositories/agent-run-repository.js';

const agentData = {
  name: 'Test',
  description: '',
  instructionSource: 'inline' as const,
  instructions: 'I',
  instructionFilePath: '',
  assignmentSource: 'inline' as const,
  assignment: 'T',
  assignmentFilePath: '',
  modelConnectionId: 1,
  modelId: 'm',
  allowModelSelection: false,
  triggerNextAgent: false,
  saveResultToFile: false,
  resultDirectory: '',
  resultFilename: '',
  projectFilesystemPermissions: {
    list: true,
    read: true,
    write: false,
    createDirectory: false,
    rename: false,
    delete: false,
  },
};

function setup() {
  const db = createTestDatabase();
  const projects = new ProjectRepository(db);
  const agents = new AgentRepository(db);
  const runs = new AgentRunRepository(db);
  const project = projects.create(1, { name: 'Project', description: '' });
  const agent = agents.create(project.id, agentData);
  return { db, runs, project, agent };
}

describe('AgentRunRepository latestTotalTokens', () => {
  it('parses valid latestTotalTokens from data JSON', () => {
    const { db, runs, project, agent } = setup();
    try {
      const run = runs.create(1, project.id, agent.id, 'Test');
      assert.ok(run);

      // Simulate updating with latestTotalTokens via json_set
      db.prepare("UPDATE agent_runs SET data = json_set(data, '$.latestTotalTokens', ?) WHERE id = ?").run(2347, run.id);

      const loaded = runs.getById(1, project.id, agent.id, run.id);
      assert.equal(loaded?.data.latestTotalTokens, 2347);
    } finally {
      db.close();
    }
  });

  it('legacy data without latestTotalTokens loads as null', () => {
    const { db, runs, project, agent } = setup();
    try {
      const run = runs.create(1, project.id, agent.id, 'Legacy');
      assert.ok(run);

      const loaded = runs.getById(1, project.id, agent.id, run.id);
      assert.equal(loaded?.data.latestTotalTokens, null);
    } finally {
      db.close();
    }
  });

  it('updateLatestTotalTokens persists the value', () => {
    const { db, runs, project, agent } = setup();
    try {
      const run = runs.create(1, project.id, agent.id, 'Test');
      assert.ok(run);

      runs.updateLatestTotalTokens(run.id, 5800);

      const loaded = runs.getById(1, project.id, agent.id, run.id);
      assert.equal(loaded?.data.latestTotalTokens, 5800);
    } finally {
      db.close();
    }
  });

  it('replacing latestTotalTokens updates to new value', () => {
    const { db, runs, project, agent } = setup();
    try {
      const run = runs.create(1, project.id, agent.id, 'Test');
      assert.ok(run);

      runs.updateLatestTotalTokens(run.id, 2347);
      runs.updateLatestTotalTokens(run.id, 5800);

      const loaded = runs.getById(1, project.id, agent.id, run.id);
      assert.equal(loaded?.data.latestTotalTokens, 5800);
    } finally {
      db.close();
    }
  });

  it('invalid latestTotalTokens (negative) causes parseData to throw', () => {
    const { db, runs, project, agent } = setup();
    try {
      const run = runs.create(1, project.id, agent.id, 'Test');
      assert.ok(run);

      // Insert invalid negative value directly
      db.prepare("UPDATE agent_runs SET data = json_set(data, '$.latestTotalTokens', ?) WHERE id = ?").run(-5, run.id);

      assert.throws(
        () => runs.getById(1, project.id, agent.id, run.id),
        (error: Error) => error.message === 'Invalid Agent run data',
      );
    } finally {
      db.close();
    }
  });

  it('invalid latestTotalTokens (fractional) causes parseData to throw', () => {
    const { db, runs, project, agent } = setup();
    try {
      const run = runs.create(1, project.id, agent.id, 'Test');
      assert.ok(run);

      // Insert fractional value directly (SQLite stores as float)
      db.prepare("UPDATE agent_runs SET data = json_set(data, '$.latestTotalTokens', ?) WHERE id = ?").run(2347.5, run.id);

      assert.throws(
        () => runs.getById(1, project.id, agent.id, run.id),
        (error: Error) => error.message === 'Invalid Agent run data',
      );
    } finally {
      db.close();
    }
  });
});
