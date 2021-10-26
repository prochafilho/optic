import { FactAccumulator, Traverse } from "../../sdk/types";
import { IPathComponent } from "../../sdk/types";
import { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import ResponseObject = OpenAPIV3_1.ResponseObject;

export class OpenAPITraverser
  implements Traverse<OpenAPIV3.Document, OpenAPIFacts>
{
  format = "openapi3";
  accumulator = new FactAccumulator<OpenAPIFacts>([]);

  async prepare(input: any): Promise<OpenAPIV3.Document> {
    const client = require("swagger-client");
    const result = await client.resolve({ spec: input });
    return result.spec as OpenAPIV3.Document;
  }

  traverse(input: OpenAPIV3.Document): void {
    Object.entries(input.paths).forEach(([pathPattern, paths]) => {
      if (paths?.get) this.traverseOperations(paths?.get!, "get", pathPattern);
      if (paths?.patch)
        this.traverseOperations(paths?.patch!, "patch", pathPattern);
      if (paths?.post)
        this.traverseOperations(paths?.post!, "post", pathPattern);
      if (paths?.put) this.traverseOperations(paths?.put!, "put", pathPattern);
      if (paths?.delete)
        this.traverseOperations(paths?.delete!, "delete", pathPattern);
    });
  }

  traverseOperations(
    operation: OpenAPIV3.OperationObject,
    method: string,
    pathPattern: string
  ): void {
    const jsonPath = ["paths", pathPattern, method];
    const conceptualPath = ["operations", pathPattern, method];
    this.onOperation(
      operation,
      pathPattern,
      method,
      ["paths", pathPattern, method],
      ["operations", pathPattern, method]
    );

    Object.entries(operation.responses).forEach(([statusCode, response]) => {
      this.traverseResponse(
        response as ResponseObject,
        statusCode,
        [...jsonPath, "responses", statusCode],
        [...conceptualPath, "responses", statusCode]
      );
    });
  }

  traverseResponse(
    response: OpenAPIV3.ResponseObject,
    statusCode: string,
    jsonPath: IPathComponent[],
    conceptualPath: IPathComponent[]
  ): void {
    // skip this because we want bodies to be anchored to (content-type, statusCode)
    // this.onResponse(response, statusCode, jsonPath, conceptualPath);

    Object.entries(response.content || {}).forEach(([contentType, body]) => {
      //@TODO: add status code to jsonPath, ...
      this.traverseBody(
        body,
        contentType,
        [...jsonPath, "content", contentType, "body"],
        [...conceptualPath, contentType],
      );
    });
  }

  traverseBody(
    body: OpenAPIV3.MediaTypeObject,
    contentType: string,
    jsonPath: IPathComponent[],
    conceptualPath: IPathComponent[]
  ) {
    if (body.schema && Object.keys(body.schema).length) {
      this.onContentForBody(body, contentType, jsonPath, conceptualPath);
      this.traverseSchema(body.schema as OpenAPIV3.SchemaObject, jsonPath, conceptualPath);
    }
  }

  traverseField(
    key: string,
    schema: OpenAPIV3.SchemaObject,
    required: boolean,
    jsonPath: IPathComponent[],
    conceptualPath: IPathComponent[]
  ) {
    this.onField(key, schema, required, jsonPath, conceptualPath);
    this.traverseSchema(schema, jsonPath, conceptualPath);
  }

  traverseSchema(
    schema: OpenAPIV3.SchemaObject,
    jsonPath: IPathComponent[],
    conceptualPath: IPathComponent[]
  ) {
    console.log(schema);
    if (schema.oneOf || schema.anyOf || schema.allOf) {
      // iterate these, multiple branches at path
      const e = new Error(`unsupported schema ${JSON.stringify(schema)}`)
      console.error(e);
      return;
    }
    switch (schema.type) {
      case "object":
        this.onObject(jsonPath, conceptualPath, schema);
        Object.entries(schema.properties || {}).forEach(([key, fieldSchema]) =>
          this.traverseField(
            key,
            fieldSchema as OpenAPIV3.SchemaObject,
            (schema.required || []).includes(key),
            [...jsonPath, "properties", key],
            [...conceptualPath, key]
          )
        );
        break;
      case "array":
        break;
      case "string":
      case "number":
      case "integer":
        break;
    }
  }

  ///////////////////////////////////////////////////////////////////////////////////

  onContentForBody(
    body: OpenAPIV3.MediaTypeObject,
    contentType: string,
    jsonPath: IPathComponent[],
    conceptualPath: IPathComponent[]
  ) {
    const value: OpenApiBodyFact = {
      // schema: (body.schema || {}) as OpenAPIV3.SchemaObject,
    };
    this.accumulator.log({
      location: {
        jsonPath,
        conceptualPath,
        kind: "body",
      },
      value,
    });
  }

  onObject(
    jsonPath: IPathComponent[],
    conceptualPath: IPathComponent[],
    schema: OpenAPIV3.SchemaObject
  ) {
    const value: OpenApiObjectFact = {

    }
    this.accumulator.log({
      location: {
        jsonPath,
        conceptualPath,
        kind: "object"
      },
      value
    })
  }
  onField(
    key: string,
    schema: OpenAPIV3.SchemaObject,
    required: boolean,
    jsonPath: IPathComponent[],
    conceptualPath: IPathComponent[]
  ) {
    const value: OpenApiFieldFact = {
      required,
      schemaTypes: [schema.type ?? 'any']
    };
    this.accumulator.log({
      location: {
        jsonPath,
        conceptualPath,
        kind: "field",
      },
      value,
    });
  }

  onOperation(
    operation: OpenAPIV3.OperationObject,
    pathPattern: string,
    method: string,
    jsonPath: IPathComponent[],
    conceptualPath: IPathComponent[]
  ) {
    const value: OpenApiEndpointFact = {
      method,
      pathPattern,
    };
    this.accumulator.log({
      location: {
        jsonPath,
        conceptualPath,
        kind: "endpoint",
      },
      value,
    });
  }
  onResponse(
    response: OpenAPIV3.ResponseObject,
    statusCode: string,
    jsonPath: IPathComponent[],
    conceptualPath: IPathComponent[]
  ) {
    // const value: OpenApiResponseFact = {
    //   statusCode: parseInt(statusCode),
    // };
    // this.accumulator.log({
    //   location: {
    //     jsonPath,
    //     conceptualPath,
    //     kind: "response",
    //   },
    //   value,
    // });
  }
}

type OpenAPIFacts =
  | OpenApiEndpointFact
  | OpenApiResponseFact
  | OpenApiBodyFact
  | OpenApiFieldFact;

export interface OpenApiEndpointFact {
  pathPattern: string;
  method: string;
  // summary: string;
}

export interface OpenApiBodyFact {
  // contentType: string;
  // schema: OpenAPIV3.SchemaObject;
}

export interface OpenApiFieldFact {
  // key: string;
  required: boolean;
  schemaTypes: string[];
  // schema: OpenAPIV3.SchemaObject;
}
export interface OpenApiObjectFact {

}
export interface OpenApiResponseFact {
  statusCode: number;
}
