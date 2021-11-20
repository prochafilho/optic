/*

  OpenAPI projections for diffs
   - assemble all the information required to diff
   - retrain pointers to ast nodes

   */
import { ConceptualLocation, OpenAPIV3 } from '@useoptic/openapi-utilities';
import { IFilePatch } from '../patch/types';

export interface OpenAPIDiffingQuestions {
  paths(): string[];
  operations(): {
    path: string;
    method: OpenAPIV3.HttpMethods;
    jsonPath: string;
  }[];
  responsesForOperation(
    method: OpenAPIV3.HttpMethods,
    path: string
  ): ResponseMatchType[];

  queryParametersForOperation(
    method: OpenAPIV3.HttpMethods,
    path: string
  ): QueryParameterType[];
}

export interface ISpecReader {
  questions(): Promise<OpenAPIDiffingQuestions>;
  flattenedSpecification(): Promise<OpenAPIV3.Document>;
  didLoad(): Promise<DidLoadStatus>;
  isStale(): Promise<FilePathsWithChanges[] | false>;
  save(patch: IFilePatch): Promise<void>;
  describeLocation(): string;
  rootFile(): string;
}

export type FilePathsWithChanges = string[];
export type DidLoadStatus =
  | { success: true; durationMillis: number }
  | { success: false; error: string; durationMillis: number };

export const openApiDiffingQuestionsTestingStub: OpenAPIDiffingQuestions = {
  operations() {
    return [];
  },
  paths(): string[] {
    return [];
  },
  responsesForOperation(method: OpenAPIV3.HttpMethods, path: string) {
    return [];
  },
  queryParametersForOperation(method: OpenAPIV3.HttpMethods, path: string) {
    return [];
  },
};

// Result Types
export type ResponseMatchType = {
  statusCodeMatcher: string;
  contentTypes: {
    contentType: string;
    schema?: OpenAPIV3.SchemaObject;
    location: ConceptualLocation;
    jsonPath: string;
  }[];
};
export type QueryParameterType = {
  name: string;
  schema?: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject;
  location: ConceptualLocation;
  jsonPath: string;
  required: boolean;
};
