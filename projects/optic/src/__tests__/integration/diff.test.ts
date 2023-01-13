import { test, expect, describe, jest } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'path';
import {
  runOptic,
  setupWorkspace,
  normalizeWorkspace,
  setupTestServer,
} from './integration';

jest.setTimeout(30000);

describe('diff', () => {
  test('two files, no repo or config', async () => {
    const workspace = await setupWorkspace('diff/files-no-repo', {
      repo: false,
    });
    const { combined, code } = await runOptic(
      workspace,
      'diff example-api-v0.json example-api-v1.json'
    );
    expect(normalizeWorkspace(workspace, combined)).toMatchSnapshot();
    expect(code).toBe(0);
  });

  test('basic rules config', async () => {
    const workspace = await setupWorkspace('diff/basic-rules-dev-yml', {
      repo: true,
      commit: true,
    });
    const { combined, code } = await runOptic(
      workspace,
      'diff example-api-v0.json example-api-v1.json --check'
    );

    expect(code).toBe(1);
    expect(normalizeWorkspace(workspace, combined)).toMatchSnapshot();
  });

  test('breaking changes exclusion', async () => {
    const workspace = await setupWorkspace(
      'diff/breaking-changes-exclusion-dev-yml',
      {
        repo: true,
        commit: true,
      }
    );
    const { combined, code } = await runOptic(
      workspace,
      'diff example-api-v0.json example-api-v1.json --check'
    );

    expect(code).toBe(0);
    expect(normalizeWorkspace(workspace, combined)).toMatchSnapshot();
  });

  test('petstore diff', async () => {
    const workspace = await setupWorkspace('diff/petstore', {
      repo: true,
      commit: true,
    });
    const { combined, code } = await runOptic(
      workspace,
      'diff petstore-base.json petstore-updated.json --check --ruleset ./ruleset.yml'
    );

    expect(code).toBe(1);
    expect(normalizeWorkspace(workspace, combined)).toMatchSnapshot();
  });

  test('with --ruleset arg', async () => {
    const workspace = await setupWorkspace('diff/with-ruleset-arg', {
      repo: true,
      commit: true,
    });
    const { combined, code } = await runOptic(
      workspace,
      'diff example-api-v0.json example-api-v1.json --check --ruleset ./ruleset.yml'
    );

    expect(code).toBe(1);
    expect(normalizeWorkspace(workspace, combined)).toMatchSnapshot();
  });

  describe('with mock server', () => {
    setupTestServer(async ({ url, method }) => {
      if (method === 'GET' && /\/api\/rulesets/.test(url)) {
        return JSON.stringify({
          rulesets: [
            {
              name: '@org/custom-ruleset',
              url: `${process.env.BWTS_HOST_OVERRIDE}/download-url`,
              uploaded_at: '2022-11-02T17:55:48.078Z',
            },
          ],
        });
      } else if (method === 'GET' && /download-url/.test(url)) {
        return fs.readFile(
          path.resolve(
            __dirname,
            './workspaces/diff/custom-rules/rules/cloud-mock.js'
          )
        );
      } else if (method === 'GET' && /\/api\/ruleset-configs\//) {
        return JSON.stringify({
          organization_id: 'abc',
          config: {
            ruleset: [{ name: 'breaking-changes', config: {} }],
          },
          ruleset_id: 'abc',
          created_at: '2022-11-02T17:55:48.078Z',
          updated_at: '2022-11-02T17:55:48.078Z',
        });
      }
      return JSON.stringify({});
    });

    test('ruleset key on api spec', async () => {
      const workspace = await setupWorkspace('diff/with-x-optic-ruleset', {
        repo: true,
        commit: true,
      });
      const { combined, code } = await runOptic(
        workspace,
        'diff example-api-v0.json example-api-v1.json --check'
      );

      expect(code).toBe(1);
      expect(normalizeWorkspace(workspace, combined)).toMatchSnapshot();
    });

    test('custom rules', async () => {
      const workspace = await setupWorkspace('diff/custom-rules', {
        repo: true,
        commit: true,
      });
      const { combined, code } = await runOptic(
        workspace,
        'diff example-api-v0.json example-api-v1.json --check'
      );

      expect(code).toBe(1);
      expect(normalizeWorkspace(workspace, combined)).toMatchSnapshot();
    });

    test('extends', async () => {
      const workspace = await setupWorkspace('diff/extends', {
        repo: true,
        commit: true,
      });
      const { combined, code } = await runOptic(
        workspace,
        'diff example-api-v0.json example-api-v1.json --check'
      );

      expect(code).toBe(1);
      expect(normalizeWorkspace(workspace, combined)).toMatchSnapshot();
    });
  });
});
