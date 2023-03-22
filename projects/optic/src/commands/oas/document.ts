import { Command } from 'commander';

import { createCommandFeedback, InputErrors } from './reporters/feedback';

import chalk from 'chalk';
import { readDeferencedSpec } from './specs';
import {
  addIfUndocumented,
  matchInteractions,
  parseAddOperations,
} from './diffing/document';
import Path from 'path';
import * as fs from 'fs-extra';
import { getInteractions } from './verify';
import { getApiFromOpticUrl } from '../../utils/cloud-urls';
import { OPTIC_URL_KEY } from '../../constants';

type DocumentOptions = {
  all?: string;
  har?: string;
};

export function documentCommand(): Command {
  const command = new Command('document');
  const feedback = createCommandFeedback(command);

  command
    .description('document a new operation in the OpenAPI')
    .argument(
      '<openapi-file>',
      'an OpenAPI spec to match up to observed traffic'
    )
    .option('--har <har-file>', 'path to HttpArchive file (v1.2, v1.3)')
    .option('--all', 'Patch existing operations to resolve diffs')
    .argument(
      '[operations...]',
      'the paths to document format "get /path/{id}"',
      []
    )
    .action(async (specPath, operations) => {
      const analytics: { event: string; properties: any }[] = [];
      const options: DocumentOptions = command.opts();

      const operationsToAdd = parseAddOperations(operations);
      if (operationsToAdd.err) {
        return feedback.inputError(
          'To document an operation you must use the format "get /path/{id}"...',
          InputErrors.DOCUMENT_OPERATION_FORMAT
        );
      }
      const isAddAll = Boolean(options.all);

      const absoluteSpecPath = Path.resolve(specPath);
      if (!(await fs.pathExists(absoluteSpecPath))) {
        return await feedback.inputError(
          'OpenAPI specification file could not be found',
          InputErrors.SPEC_FILE_NOT_FOUND
        );
      }

      const specReadResult = await readDeferencedSpec(absoluteSpecPath);
      if (specReadResult.err) {
        return await feedback.inputError(
          `OpenAPI specification could not be fully resolved: ${specReadResult.val.message}`,
          InputErrors.SPEC_FILE_NOT_READABLE
        );
      }

      const opticUrlDetails = getApiFromOpticUrl(
        specReadResult.val.jsonLike[OPTIC_URL_KEY]
      );

      const makeInteractionsIterator = async () =>
        getInteractions(options, specPath, feedback);

      const { jsonLike: spec, sourcemap } = specReadResult.unwrap();

      feedback.notable('Documenting operations...');

      let { observations } = matchInteractions(
        spec,
        await makeInteractionsIterator()
      );

      const result = await addIfUndocumented(
        operationsToAdd.val,
        isAddAll,
        observations,
        await makeInteractionsIterator(),
        spec,
        sourcemap
      );

      if (result.ok) {
        analytics.push({
          event: 'openapi.verify.document',
          properties: {
            allFlag: isAddAll,
            numberDocumented: result.val.length,
          },
        });
        result.val.map((operation) => {
          console.log(
            `  ${chalk.green('added')}  ${operation.method} ${
              operation.pathPattern
            }`
          );
        });
      }

      if (!opticUrlDetails) {
        console.log('');
        console.log(
          `Share a link to documentation with your team (${chalk.bold(
            `optic api add ${specPath})`
          )}`
        );
      }
    });
  return command;
}
