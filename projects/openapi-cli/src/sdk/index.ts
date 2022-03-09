import {
  readDeferencedSpec,
  SpecFiles,
  SpecPatches,
  SpecFileOperations,
  SpecTemplate,
  OpenAPIV3,
} from '../specs';

export { SpecTemplate, OpenAPIV3 };

export async function applyTemplate<T>(
  template: SpecTemplate<T>,
  absoluteSpecPath: string,
  options: T
): Promise<void> {
  const { jsonLike: spec, sourcemap } = await readDeferencedSpec(
    absoluteSpecPath
  );
  const specFiles = [...SpecFiles.fromSourceMap(sourcemap)];

  const specPatches = SpecPatches.generateByTemplate(spec, template, options);

  const fileOperations = SpecFileOperations.fromSpecPatches(
    specPatches,
    sourcemap
  );

  const updatedSpecFiles = SpecFiles.patch(specFiles, fileOperations);

  for await (let _writtenFilePath of SpecFiles.writeFiles(updatedSpecFiles)) {
  }
}
