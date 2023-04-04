import { CapturedBody } from './body';
import { OpenAPIV3 } from '../specs';
import { HttpArchive } from './streams/sources/har';
import { ProxySource } from './streams/sources/proxy';
import { URL } from 'url';
import { HttpMethods, Operation } from '../operations';
import invariant from 'ts-invariant';
import { Buffer } from 'buffer';
import { PostmanEntry } from './streams/sources/postman';

type Header = {
  name: string;
  value: string;
};

type Query = {
  name: string;
  value: string | string[];
};

export interface CapturedInteraction {
  request: {
    host: string;
    method: OpenAPIV3.HttpMethods;
    path: string;
    body: CapturedBody | null;
    // TODO implement support for headers / queries
    headers: Header[];
    query: Query[];
  };
  response?: {
    statusCode: string;
    body: CapturedBody | null;
    // TODO implement support for response headers
    headers: Header[];
  };
}
export class CapturedInteraction {
  static fromHarEntry(entry: HttpArchive.Entry): CapturedInteraction {
    const url = new URL(entry.request.url);

    const method = HttpMethods[entry.request.method];
    invariant(
      Operation.isHttpMethod(method),
      `expect HAR entry to have a valid request method`
    );

    let requestBody: CapturedBody | null = null;
    let responseBody: CapturedBody | null = null;

    const requestPostData = entry.request.postData;
    if (
      requestPostData &&
      (!requestPostData.encoding || Buffer.isEncoding(requestPostData.encoding))
    ) {
      let buffer = Buffer.from(
        requestPostData.text,
        requestPostData.encoding as BufferEncoding | undefined
      );
      requestBody = CapturedBody.from(
        buffer,
        requestPostData.mimeType,
        entry.request.bodySize
      );
    }

    const responseContent = entry.response.content;
    if (
      responseContent.text &&
      (!responseContent.encoding || Buffer.isEncoding(responseContent.encoding))
    ) {
      let buffer = Buffer.from(
        responseContent.text,
        responseContent.encoding as BufferEncoding | undefined
      );
      responseBody = CapturedBody.from(
        buffer,
        responseContent.mimeType,
        responseContent.size
      );
    }

    return {
      request: {
        host: url.hostname,
        method,
        path: url.pathname,
        body: requestBody,
        headers: [],
        query: [],
      },
      response: {
        statusCode: '' + entry.response.status,
        body: responseBody,
        headers: [],
      },
    };
  }

  static fromProxyInteraction(
    proxyInteraction: ProxySource.Interaction
  ): CapturedInteraction {
    const url = new URL(proxyInteraction.request.url);

    const method = HttpMethods[proxyInteraction.request.method];
    invariant(
      Operation.isHttpMethod(method),
      `expect proxy interaction to have a valid request method`
    );

    let requestBody: CapturedBody | null = null;
    let responseBody: CapturedBody | null = null;

    const requestBodyBuffer = proxyInteraction.request.body.buffer;
    if (requestBodyBuffer.length > 0) {
      let contentType = proxyInteraction.request.headers['content-type'];
      let contentLength = proxyInteraction.request.headers['content-length'];

      requestBody = CapturedBody.from(
        requestBodyBuffer,
        contentType || null,
        contentLength ? parseInt(contentLength, 10) : 0
      );
    }

    const responseBodyBuffer = proxyInteraction.response.body.buffer;
    if (responseBodyBuffer.length > 0) {
      let contentType = proxyInteraction.response.headers['content-type'];
      let contentLength = proxyInteraction.response.headers['content-length'];

      responseBody = CapturedBody.from(
        responseBodyBuffer,
        contentType || null,
        contentLength ? parseInt(contentLength, 10) : 0
      );
    }

    return {
      request: {
        host: url.hostname,
        method,
        path: url.pathname,
        body: requestBody,
        headers: [],
        query: [],
      },
      response: {
        statusCode: '' + proxyInteraction.response.statusCode,
        body: responseBody,
        headers: [],
      },
    };
  }

  static fromPostmanCollection(
    postmanEntry: PostmanEntry
  ): CapturedInteraction {
    const { request, response } = postmanEntry;
    const query = request.url.query.map((query) => ({
      key: query.key,
      value: query.value,
    }));

    const requestMethod = request.method?.toUpperCase();
    const method = HttpMethods[requestMethod || 'GET'];
    invariant(
      Operation.isHttpMethod(method),
      `expect Postman collection request to have a valid request method`
    );

    const requestBodySource = request.body?.toString() || '';
    const requestBody = CapturedBody.from(
      requestBodySource,
      request.headers.get('Content-Type'),
      requestBodySource.length
    );

    const responseBody = response
      ? CapturedBody.from(
          response.body || '',
          response.headers.get('Content-Type'),
          response.body?.length || 0
        )
      : null;

    return {
      request: {
        host: request.url.getHost(),
        method,
        path: request.url.getPath(),
        query,
        headers: request.headers.all(),
        body: requestBody,
      },
      response: {
        statusCode: response?.code.toString() || '200',
        headers: response?.headers.all() || [],
        body: responseBody,
      },
    };
  }
}

export type CapturedRequest = CapturedInteraction['request'];
export type CapturedResponse = CapturedInteraction['response'];
