import {
  IChange,
  OpenApiKind,
  IFact,
  ILocation,
} from "@useoptic/openapi-utilities";
import { EntityRule, newDocsLinkHelper, Result, runCheck } from "./types";

export function genericEntityRuleImpl<Type, ApiContext, DslContext>(
  openApiKind: OpenApiKind,
  changelog: IChange<any>[],
  nextFacts: IFact<any>[],
  describeWhere: (fact: Type) => string,
  getContext: (location: ILocation) => ApiContext & DslContext,
  pushCheck: (...check: Promise<Result>[]) => void
): EntityRule<Type, ApiContext, DslContext> {
  const operations = changelog.filter((i) => i.location.kind === openApiKind);

  const added = operations.filter((i) => Boolean(i.added)) as IChange<Type>[];
  const removed = operations.filter((i) =>
    Boolean(i.removed)
  ) as IChange<Type>[];
  const changes = operations.filter((i) =>
    Boolean(i.changed)
  ) as IChange<Type>[];

  const requirements: IFact<Type>[] = nextFacts.filter(
    (i) => i.location.kind === openApiKind
  );

  const addedHandler: (
    must: boolean
  ) => EntityRule<Type, ApiContext, DslContext>["added"]["must"] = (
    must: boolean
  ) => {
    return (statement, handler) => {
      pushCheck(
        ...added.map((item, index) => {
          const addedWhere = `added ${openApiKind.toString()}: ${describeWhere(
            item.added!
          )}`;
          const docsHelper = newDocsLinkHelper();
          return runCheck(item, docsHelper, addedWhere, statement, must, () =>
            handler(item.added!, getContext(item.location), docsHelper)
          );
        })
      );
    };
  };

  const removedHandler: (
    must: boolean
  ) => EntityRule<Type, ApiContext, DslContext>["removed"]["must"] = (
    must: boolean
  ) => {
    return (statement, handler) => {
      pushCheck(
        ...removed.map((item, index) => {
          const addedWhere = `removed ${openApiKind.toString()}: ${describeWhere(
            item.removed!.before!
          )}`;
          const docsHelper = newDocsLinkHelper();
          return runCheck(item, docsHelper, addedWhere, statement, must, () =>
            handler(item.added!, getContext(item.location), docsHelper)
          );
        })
      );
    };
  };

  const changedHandler: (
    must: boolean
  ) => EntityRule<Type, ApiContext, DslContext>["changed"]["must"] = (
    must: boolean
  ) => {
    return (statement, handler) => {
      pushCheck(
        ...changes.map((item, index) => {
          const updatedWhere = `updated ${openApiKind.toString()}: ${describeWhere(
            item.changed!.after!
          )}`;
          const docsHelper = newDocsLinkHelper();
          return runCheck(item, docsHelper, updatedWhere, statement, must, () =>
            handler(
              item.changed!.before,
              item.changed!.after,
              getContext(item.location),
              docsHelper
            )
          );
        })
      );
    };
  };

  const requirementsHandler: (
    must: boolean
  ) => EntityRule<Type, ApiContext, DslContext>["requirement"]["must"] = (
    must: boolean
  ) => {
    return (statement, handler) => {
      pushCheck(
        ...requirements.map((item, index) => {
          const where = `requirement for ${openApiKind.toString()}: ${describeWhere(
            item.value
          )}`;
          const docsHelper = newDocsLinkHelper();
          return runCheck(item, docsHelper, where, statement, must, () =>
            handler(item.value, getContext(item.location), docsHelper)
          );
        })
      );
    };
  };

  // const requirementOfSpecHandler: (
  //   must: boolean
  // ) => EntityRule<Type, ApiContext, DslContext>["requirement"]["must"] = (
  //   must: boolean
  // ) => {
  //   return (statement, handler) => {
  //     pushCheck(
  //       ...requirements.map((item, index) => {
  //         const where = `requirement for ${openApiKind.toString()}: ${describeWhere(
  //           item.value
  //         )}`;
  //
  //         console.log(item.location.jsonPath);
  //
  //         const docsHelper = newDocsLinkHelper();
  //         return runCheck(item, docsHelper, where, statement, must, () =>
  //           handler(item.value, getContext(item.location), docsHelper)
  //         );
  //       })
  //     );
  //   };
  // };

  return {
    added: {
      must: addedHandler(true),
      should: addedHandler(false),
    },
    changed: {
      must: changedHandler(true),
      should: changedHandler(false),
    },
    removed: {
      must: removedHandler(true),
      should: removedHandler(false),
    },
    requirement: {
      must: requirementsHandler(true),
      should: requirementsHandler(false),
      // spec: {},
    },
  };
}
