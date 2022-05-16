import { OperationRule, RuleError } from '@useoptic/rulesets-base';
import { getOperationAssertionsParameter } from './helpers/getOperationAssertionsParameter';
import { ParameterIn } from './helpers/types';

const getPreventRequireExistingParameter = (parameterIn: ParameterIn) =>
  new OperationRule({
    name: `prevent ${parameterIn} parameters enum breaking changes`,
    rule: (operationAssertions, _ruleContext) => {
      const parameter = getOperationAssertionsParameter(
        operationAssertions,
        parameterIn
      );

      parameter.changed(
        'not make an optional parameter required',
        (before, after) => {
          if (!before.value.required && after.value.required) {
            throw new RuleError({
              message: 'cannot make an optional parameter required',
            });
          }
        }
      );
    },
  });

export const preventRequireExistingQueryParameter =
  getPreventRequireExistingParameter('query');

export const preventRequireExistingCookieParameter =
  getPreventRequireExistingParameter('cookie');

export const preventRequireExistingPathParameter =
  getPreventRequireExistingParameter('path');

export const preventRequireExistingHeaderParameter =
  getPreventRequireExistingParameter('header');
