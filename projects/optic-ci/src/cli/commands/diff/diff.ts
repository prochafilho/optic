import { Command } from 'commander';
import brotli from 'brotli';
import open from 'open';
import {
  defaultEmptySpec,
  validateOpenApiV3Document,
} from '@useoptic/openapi-utilities';
import { wrapActionHandlerWithSentry } from '../../sentry';
import {
  ParseResult,
  parseSpecVersion,
  specFromInputToResults,
} from '../utils';

export const registerDiff = (cli: Command, hideCommand: boolean) => {
  cli
    .command(
      'diff',
      hideCommand
        ? {
            hidden: true,
          }
        : {}
    )
    // .description()
    // .summary()
    // .usage('./openapi-spec.yml master:openapi-spec/yml')
    // .usage('./openapi-spec.yml --base master')
    .argument('<file>', 'path to file to compare')
    .argument('[compare_with_file]', 'path to file to compare with')
    .option('--base <base>', 'the base ref to compare against')
    .action(
      wrapActionHandlerWithSentry(
        // TODO document this well
        // Either is diff <before> <after>
        // or
        // diff <filepath> --base ref
        async (
          file1: string,
          file2: string | undefined,
          options: {
            base?: string;
          }
        ) => {
          if (file2) {
            const baseFilePath = file1;
            const headFilePath = file2;
            const [baseFile, headFile] = await Promise.all([
              getFileFromFsOrGit(baseFilePath),
              getFileFromFsOrGit(headFilePath),
            ]);
            const compressedData = compressData(baseFile, headFile);
            console.log(compressedData.length);
            openBrowserToPage(
              `http://localhost:3000/organizations/046b3dd0-a1c6-4ec8-96b3-a1906164d0ec?data=${compressedData}`
            );
          } else if (options.base) {
            // TODO check if in git repo
            // TODO implement
          } else {
            // TODO error
          }
        }
      )
    );
};

const getFileFromDifferentRef = (filePath: string, ref: string) => {
  // TODO implement
};

// filePathOrRef can be a path, or a gitref:path (delimited by `:`)
const getFileFromFsOrGit = async (filePathOrRef: string) => {
  const file = await specFromInputToResults(
    parseSpecVersion(filePathOrRef, defaultEmptySpec),
    process.cwd()
  ).then((results) => {
    validateOpenApiV3Document(results.jsonLike);
    return results;
  });
  return file;
};

const compressData = (baseFile: ParseResult, headFile: ParseResult): string => {
  const dataToCompress = {
    base: baseFile.jsonLike,
    head: headFile.jsonLike,
  };
  // TODO maybe strip out unnecessary things here?
  // We could strip out:
  // - components that do not have a `$ref` key - they should be flattened, except for any circular refs
  const compressed = brotli.compress(
    Buffer.from(JSON.stringify(dataToCompress))
  );
  const urlSafeString = Buffer.from(compressed).toString('base64');
  return urlSafeString;
};

const openBrowserToPage = async (url: string) => {
  await open(url, { wait: false });
};
