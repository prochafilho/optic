import { OpenAPIV3 } from 'openapi-types';
import flatten from 'lodash.flatten';
import {
  ApiCheckDsl,
  Result,
  factsToChangelog,
  OpenAPITraverser,
  IChange,
  IFact,
  OpenApiFact,
} from '@useoptic/openapi-utilities';
import { SpectralDsl } from './spectral/dsl';
import { ApiChangeDsl, ApiCheckDslContext } from './api-change-dsl';
import { oas } from '@stoplight/spectral-rulesets';
import { RulesetDefinition } from '@stoplight/spectral-core';

export type DslConstructorInput<Context> = {
  context: Context;
  nextFacts: IFact<OpenApiFact>[];
  currentFacts: IFact<OpenApiFact>[];
  changelog: IChange<OpenApiFact>[];
  nextJsonLike: OpenAPIV3.Document;
  currentJsonLike: OpenAPIV3.Document;
};

type SpectralRules = Extract<
  RulesetDefinition,
  { extends: any; rules: any }
>['rules'];

export class ApiCheckService<Context> {
  constructor(private getExecutionDate?: (context: Context) => Date) {}

  public rules: ((
    input: DslConstructorInput<Context>
  ) => Promise<Result>[])[] = [];
  public additionalResults: ((
    input: DslConstructorInput<Context>
  ) => Promise<Result[]>)[] = [];

  mergeWith(apiCheckService: ApiCheckService<Context>) {
    this.rules.push(...apiCheckService.rules);
    this.additionalResults.push(...apiCheckService.additionalResults);
  }

  useRulesFrom(rules: (apiChangeDsl: ApiChangeDsl) => void) {
    const dslConstructor = (input: DslConstructorInput<ApiCheckDslContext>) => {
      return new ApiChangeDsl(
        input.nextFacts,
        input.changelog,
        input.currentJsonLike,
        input.nextJsonLike,
        input.context
      );
    };

    const runner = (input: DslConstructorInput<Context>) => {
      const dsl = dslConstructor(input);
      rules(dsl);
      return dsl.checkPromises();
    };

    this.rules.push(runner);
    return this;
  }

  useDsl<DSL extends ApiCheckDsl>(
    dslConstructor: (input: DslConstructorInput<Context>) => DSL,
    ...rules: ((dsl: DSL) => void)[]
  ) {
    const runner = (input: DslConstructorInput<Context>) => {
      const dsl = dslConstructor(input);
      rules.forEach((i) => i(dsl));
      return dsl.checkPromises();
    };

    this.rules.push(runner);
    return this;
  }
  // for our standard DSL
  useRules(rulesMap: { [key: string]: (dsl: ApiChangeDsl) => void }) {
    const dslConstructor = (input: DslConstructorInput<ApiCheckDslContext>) => {
      return new ApiChangeDsl(
        input.nextFacts,
        input.changelog,
        input.currentJsonLike,
        input.nextJsonLike,
        input.context
      );
    };

    const runner = (input: DslConstructorInput<Context>) => {
      const dsl = dslConstructor(input);
      const rules = Object.values(rulesMap);
      rules.forEach((i) => i(dsl));
      return dsl.checkPromises();
    };

    this.rules.push(runner);
    return this;
  }

  // tried using "Ruleset" but getting typeerrors -- falling back to any
  useSpectralRuleset(ruleset: RulesetDefinition) {
    const runner = async (input: DslConstructorInput<Context>) => {
      const dsl = new SpectralDsl(input.nextJsonLike, input.nextFacts, ruleset);
      return await dsl.spectralChecksResults;
    };
    this.additionalResults.push(runner);
    return this;
  }

  // Wrapper for useSpectralRuleset that includes the `oas` ruleset and allows for
  // extending them with `rules`. This removes the need for the user to pass in
  // an `oas`, which might be incompatible.
  useSpectralOasRuleset(rules: SpectralRules) {
    const runner = async (input: DslConstructorInput<Context>) => {
      const dsl = new SpectralDsl(input.nextJsonLike, input.nextFacts, {
        extends: [[oas as RulesetDefinition, 'all']],
        rules,
      });
      return await dsl.spectralChecksResults;
    };
    this.additionalResults.push(runner);
    return this;
  }

  useDslWithNamedRules<DSL extends ApiCheckDsl>(
    dslConstructor: (input: DslConstructorInput<Context>) => DSL,
    rulesMap: { [key: string]: (dsl: DSL) => void }
  ) {
    const runner = (input: DslConstructorInput<Context>) => {
      const dsl = dslConstructor(input);
      const rules = Object.values(rulesMap);
      rules.forEach((i) => i(dsl));
      return dsl.checkPromises();
    };

    this.rules.push(runner);
    return this;
  }

  generateFacts(
    currentJsonLike: OpenAPIV3.Document,
    nextJsonLike: OpenAPIV3.Document
  ) {
    const currentTraverser = new OpenAPITraverser();
    const nextTraverser = new OpenAPITraverser();

    currentTraverser.traverse(currentJsonLike);
    const currentFacts = currentTraverser.accumulator.allFacts();
    nextTraverser.traverse(nextJsonLike);
    const nextFacts = nextTraverser.accumulator.allFacts();

    return {
      currentFacts,
      nextFacts,
    };
  }

  async runRulesWithFacts(
    input: DslConstructorInput<Context>
  ): Promise<Result[]> {
    const checkPromises: Promise<Result>[] = flatten(
      this.rules.map((ruleRunner) => ruleRunner(input))
    );

    const additionalCheckPromises = this.additionalResults.map((ruleRunner) =>
      ruleRunner(input)
    );

    const results: Result[] = await Promise.all(checkPromises);

    const additionalCheckResults: Result[] = flatten(
      await Promise.all(additionalCheckPromises)
    );

    const date = this.getExecutionDate && this.getExecutionDate(input.context);

    const combinedResults = [...results, ...additionalCheckResults].filter(
      (result) => {
        // filter when effective date is set and context is mapped to a date of execution
        if (result.effectiveOnDate && date) {
          // execution is after effective date, include
          // execution is before effective date filter out
          return date > result.effectiveOnDate;
        }

        return true;
      }
    );

    return combinedResults;
  }

  // TODO deprecate
  async runRules(
    currentJsonLike: OpenAPIV3.Document,
    nextJsonLike: OpenAPIV3.Document,
    context: Context
  ): Promise<Result[]> {
    const { currentFacts, nextFacts } = this.generateFacts(
      currentJsonLike,
      nextJsonLike
    );

    return this.runRulesWithFacts({
      currentJsonLike,
      nextJsonLike,
      currentFacts,
      nextFacts,
      changelog: factsToChangelog(currentFacts, nextFacts),
      context,
    });
  }
}
