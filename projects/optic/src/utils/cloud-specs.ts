import { IChange, ResultWithSourcemap } from '@useoptic/openapi-utilities';
import { OpticBackendClient } from '../client';
import { computeChecksum } from './checksum';
import { uploadFileToS3 } from './s3';
import { ParseResult } from './spec-loaders';

export const EMPTY_SPEC_ID = 'EMPTY';

export async function uploadSpec(
  apiId: string,
  opts: {
    spec: ParseResult;
    client: OpticBackendClient;
    tags: string[];
  }
): Promise<string> {
  const spec_checksum = computeChecksum(opts.spec.jsonLike);
  const sourcemap_checksum = computeChecksum(opts.spec.sourcemap);
  const result = await opts.client.prepareSpecUpload({
    api_id: apiId,
    spec_checksum,
    sourcemap_checksum,
  });
  if ('upload_id' in result) {
    await Promise.all([
      uploadFileToS3(
        result.spec_url,
        Buffer.from(JSON.stringify(opts.spec.jsonLike))
      ),
      uploadFileToS3(
        result.sourcemap_url,
        Buffer.from(JSON.stringify(opts.spec.sourcemap))
      ),
    ]);

    const { id } = await opts.client.createSpec({
      upload_id: result.upload_id,
      api_id: apiId,
      tags: opts.tags,
    });
    return id;
  } else {
    return result.spec_id;
  }
}

export async function uploadRun(
  apiId: string,
  opts: {
    fromSpecId: string;
    toSpecId: string;
    client: OpticBackendClient;
    specResults: {
      // TODO change this type
      changes: IChange[];
      results: ResultWithSourcemap[];
      version: string;
    };
  }
) {
  const checksum = computeChecksum(opts.specResults);
  const result = await opts.client.prepareRunUpload({
    api_id: apiId,
    checksum,
  });

  await uploadFileToS3(
    result.check_results_url,
    Buffer.from(JSON.stringify(opts.specResults))
  );

  await opts.client.createRun({
    upload_id: result.upload_id,
    api_id: apiId,
    from_spec_id: opts.fromSpecId,
    to_spec_id: opts.toSpecId,
  });
}
