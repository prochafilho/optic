import { Command, Option } from 'commander';
import { defaultEmptySpec } from '@useoptic/openapi-utilities';
import {
  readAndValidateGithubContext,
  readAndValidateCircleCiContext,
} from './context-parsers';
import {
  OpticBackendClient,
  RunArgs,
  SessionType,
  UploadSlot,
} from './optic-client';
import { loadFile, uploadFileToS3, writeFile } from '../utils';
import { wrapActionHandlerWithSentry, SentryClient } from '../../sentry';

export const registerUpload = (
  cli: Command,
  { opticToken }: { opticToken?: string }
) => {
  // TODO also extend this to support gitlab / bitbucket
  cli
    .command('upload')
    .option('--from <from>', 'from file or rev:file')
    .addOption(
      new Option(
        '--provider <provider>',
        'The name of the ci-provider, supported'
      )
        .choices(['github', 'circleci'])
        .makeOptionMandatory()
    )
    .requiredOption('--to <to>', 'to file or rev:file')
    .requiredOption('--context <context>', 'file with github context')
    .requiredOption('--rules <rules>', 'path to rules output')
    .action(
      wrapActionHandlerWithSentry(async (runArgs: RunArgs) => {
        if (!opticToken) {
          console.error('Upload token was not included');
          return process.exit(1);
        }

        const backendWebBase =
          // TODO centralize this optic env configuration
          process.env.OPTIC_ENV === 'staging'
            ? 'https://api.o3c.info'
            : 'https://api.useoptic.com';

        const opticClient = new OpticBackendClient(backendWebBase, () =>
          Promise.resolve(opticToken)
        );
        try {
          await uploadCiRun(opticClient, runArgs);
        } catch (e) {
          console.error(e);
          SentryClient && SentryClient.captureException(e);
          return process.exit(1);
        }
      })
    );
};

const startSession = async (
  opticClient: OpticBackendClient,
  runArgs: RunArgs,
  contextBuffer: Buffer
): Promise<string> => {
  if (runArgs.provider === 'github') {
    const { organization, pull_request, run, commit_hash, repo } =
      readAndValidateGithubContext(contextBuffer);

    const sessionId = await opticClient.startSession(
      SessionType.GithubActions,
      {
        run_args: runArgs,
        github_data: {
          organization,
          repo,
          pull_request,
          run,
          commit_hash,
        },
      }
    );
    return sessionId;
  } else if (runArgs.provider === 'circleci') {
    const { organization, pull_request, run, commit_hash, repo } =
      readAndValidateCircleCiContext(contextBuffer);

    const sessionId = await opticClient.startSession(SessionType.CircleCi, {
      run_args: runArgs,
      circle_ci_data: {
        organization,
        repo,
        pull_request,
        run,
        commit_hash,
      },
    });
    return sessionId;
  }
  throw new Error(`Unrecognized provider ${runArgs.provider}`);
};

export const uploadCiRun = async (
  opticClient: OpticBackendClient,
  runArgs: RunArgs
) => {
  console.log('Loading files...');

  const [
    contextFileBuffer,
    fromFileS3Buffer,
    toFileS3Buffer,
    rulesFileS3Buffer,
  ] = await Promise.all([
    loadFile(runArgs.context),
    runArgs.from
      ? loadFile(runArgs.from)
      : Promise.resolve(Buffer.from(JSON.stringify(defaultEmptySpec))),
    loadFile(runArgs.to),
    loadFile(runArgs.rules),
  ]);

  const fileMap: Record<UploadSlot, Buffer> = {
    [UploadSlot.CheckResults]: rulesFileS3Buffer,
    [UploadSlot.FromFile]: fromFileS3Buffer,
    [UploadSlot.ToFile]: toFileS3Buffer,
    [UploadSlot.GithubActionsEvent]: contextFileBuffer,
    [UploadSlot.CircleCiEvent]: contextFileBuffer,
  };

  const sessionId = await startSession(opticClient, runArgs, contextFileBuffer);

  console.log('Uploading OpenAPI files to Optic...');

  const uploadUrls = await opticClient.getUploadUrls(sessionId);

  const uploadedFilePaths: {
    id: string;
    slot: UploadSlot;
  }[] = await Promise.all(
    uploadUrls.map(async (uploadUrl) => {
      const file = fileMap[uploadUrl.slot];
      await uploadFileToS3(uploadUrl.url, file);

      return {
        id: uploadUrl.id,
        slot: uploadUrl.slot,
      };
    })
  );

  // TODO run this in parallel when optimistic concurrency is fixed
  // await Promise.all(
  //   uploadedFilePaths.map(async (uploadedFilePath) =>
  //     opticClient.markUploadAsComplete(
  //       sessionId,
  //       uploadedFilePath.id,
  //       uploadedFilePath.slot
  //     )
  //   )
  // );

  // Run this sequentially to work around optimistic concurrency bug
  await uploadedFilePaths.reduce(async (promiseChain, uploadedFilePath) => {
    await promiseChain;
    return opticClient.markUploadAsComplete(
      sessionId,
      uploadedFilePath.id,
      uploadedFilePath.slot
    );
  }, Promise.resolve());

  const { web_url: opticWebUrl } = await opticClient.getSession(sessionId);
  const uploadDataFilePath = 'upload-run.json'; // TODO maybe make this a cli argument?
  const uploadFileLocation = writeFile(
    uploadDataFilePath,
    Buffer.from(
      JSON.stringify({
        opticWebUrl,
      })
    )
  );

  console.log('Successfully uploaded files to Optic');
  console.log(`You can view the results of this run at: ${opticWebUrl}`);
  console.log(`Results of this run can be found at ${uploadFileLocation}`);
};
