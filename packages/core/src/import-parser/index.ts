import { DefinitionNode, parse, print, ObjectTypeDefinitionNode, DocumentNode, Kind } from 'graphql';
import { flatten, groupBy, includes, keyBy, isEqual, uniqBy } from 'lodash';
import resolveFrom from 'resolve-from';
import { loadTypedefsUsingLoaders } from '../load-typedefs';
import { LoadSchemaOptions } from '../schema';

import { completeDefinitionPool, ValidDefinitionNode } from './definition';
import { Loader } from '@graphql-toolkit/common';
import { OPERATION_KINDS } from '../documents';
import { resolve, dirname, join } from 'path';
import { realpathSync } from 'fs';

/**
 * Describes the information from a single import line
 *
 */
export interface RawModule {
  imports: string[];
  from: string;
}

const rootFields = ['Query', 'Mutation', 'Subscription'];

const gqlExt = /\.g(raph)?ql$/;
function isGraphQLFile(f: string) {
  return gqlExt.test(f);
}

/**
 * Parse a single import line and extract imported types and schema filename
 *
 * @param importLine Import line
 * @returns Processed import line
 */
export function parseImportLine(importLine: string): RawModule {
  // Apply regex to import line
  const matches = importLine.match(/^import\s+(\*|(.*))\s+from\s+('|")(.*)('|");?$/);
  if (!matches || matches.length !== 6 || !matches[4]) {
    throw new Error(`Too few regex matches: ${matches}`);
  }

  // Extract matches into named variables
  const [, wildcard, importsString, , from] = matches;

  // Extract imported types
  const imports = wildcard === '*' ? ['*'] : importsString.split(',').map(d => d.trim());

  // Return information about the import line
  return { imports, from };
}

/**
 * Parse a schema and analyze all import lines
 *
 * @param sdl Schema to parse
 * @returns Array with collection of imports per import line (file)
 */
export function parseSDL(sdl: string): RawModule[] {
  return sdl
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('# import ') || l.startsWith('#import '))
    .map(l => l.replace('#', '').trim())
    .map(parseImportLine);
}

/**
 * Main entry point. Recursively process all import statement in a schema
 *
 * @param filePath File path to the initial schema file
 * @returns Single bundled schema with all imported types
 */
export async function processImportSyntax(schemaPointer: string, sdl: string, loaders: Loader[], options?: LoadSchemaOptions, cwd = process.cwd()): Promise<DocumentNode> {
  const mergeableTypes = options.mergeableTypes || [];
  const allMergeableTypes = [...mergeableTypes, ...rootFields];
  let document = getDocumentFromSDL(sdl);

  // Recursively process the imports, starting by importing all types from the initial schema
  let { allDefinitions, typeDefinitions } = await collectDefinitions(['*'], sdl, schemaPointer, loaders, options, cwd);

  // Post processing of the final schema (missing types, unused types, etc.)
  // Query, Mutation and Subscription should be merged
  // And should always be in the first set, to make sure they
  // are not filtered out.
  const firstTypes = flatten(typeDefinitions).filter(d => includes(allMergeableTypes, d.name.value));
  const secondFirstTypes = typeDefinitions[0].filter(d => !includes(allMergeableTypes, d.name.value));
  const otherFirstTypes = flatten(typeDefinitions.slice(1)).filter(d => !includes(allMergeableTypes, d.name.value));

  const firstSet = firstTypes.concat(secondFirstTypes, otherFirstTypes);
  const processedTypeNames = [];
  const mergedFirstTypes = [];
  for (const type of firstSet) {
    if (!includes(processedTypeNames, type.name.value)) {
      processedTypeNames.push(type.name.value);
      mergedFirstTypes.push(type);
    } else {
      const existingType = mergedFirstTypes.find(t => t.name.value === type.name.value) as any;

      existingType.fields = uniqBy(existingType.fields.concat((type as ObjectTypeDefinitionNode).fields), 'name.value');
    }
  }

  document = {
    ...document,
    definitions: completeDefinitionPool(flatten(allDefinitions), firstSet, flatten(typeDefinitions)),
  };
  // Return the schema
  return document;
}

/**
 * Parses a schema into a graphql DocumentNode.
 * If the schema is empty a DocumentNode with empty definitions will be created.
 *
 * @param sdl Schema to parse
 * @returns A graphql DocumentNode with definitions of the parsed sdl.
 */
function getDocumentFromSDL(sdl: string): DocumentNode {
  if (isEmptySDL(sdl)) {
    return {
      kind: Kind.DOCUMENT,
      definitions: [],
    };
  } else {
    return parse(sdl, { noLocation: true });
  }
}

/**
 * Check if a schema contains any type definitions at all.
 *
 * @param sdl Schema to parse
 * @returns True if SDL only contains comments and/or whitespaces
 */
function isEmptySDL(sdl: string): boolean {
  return (
    sdl
      .split('\n')
      .map(l => l.trim())
      .filter(l => !(l.length === 0 || l.startsWith('#'))).length === 0
  );
}

/**
 * Resolve the path of an import.
 * First it will try to find a file relative from the file the import is in, if that fails it will try to resolve it as a module so imports from packages work correctly.
 *
 * @param filePath Path the import was made from
 * @param importFrom Path given for the import
 * @returns Full resolved path to a file
 */
function resolveModuleFilePath(filePath: string, importFrom: string): string {
  const dirName = dirname(filePath);
  if (isGraphQLFile(filePath) && isGraphQLFile(importFrom)) {
    try {
      return realpathSync(join(dirName, importFrom));
    } catch (e) {
      if (e.code === 'ENOENT') {
        const addedExtensions = new Array<string>();
        for (const graphqlFileExtension of ['.gql', '.gqls', '.graphql', '.graphqls']) {
          if (!(graphqlFileExtension in require.extensions)) {
            require.extensions[graphqlFileExtension] = () => ({});
            addedExtensions.push(graphqlFileExtension);
          }
        }
        function cleanRequireExtensions() {
          for (const extension of addedExtensions) {
            delete require.extensions[extension];
          }
        }
        try {
          const resolvedPath = resolveFrom(dirName, importFrom);
          cleanRequireExtensions();
          return resolvedPath;
        } catch (e) {
          cleanRequireExtensions();
          throw e;
        }
      }
    }
  }

  return importFrom;
}

/**
 * Recursively process all schema files. Keeps track of both the filtered
 * type definitions, and all type definitions, because they might be needed
 * in post-processing (to add missing types)
 *
 * @param imports Types specified in the import statement
 * @param sdl Current schema
 * @param filePath File location for current schema
 * @param Tracking of processed schemas (for circular dependencies)
 * @param Tracking of imported type definitions per schema
 * @param Tracking of all type definitions per schema
 * @returns Both the collection of all type definitions, and the collection of imported type definitions
 */
async function collectDefinitions(
  imports: string[],
  sdl: string,
  schemaPointer: string,
  loaders: Loader[],
  options?: LoadSchemaOptions,
  cwd = process.cwd(),
  processedFiles: Map<string, RawModule[]> = new Map(),
  typeDefinitions: ValidDefinitionNode[][] = [],
  allDefinitions: ValidDefinitionNode[][] = []
): Promise<{
  allDefinitions: ValidDefinitionNode[][];
  typeDefinitions: ValidDefinitionNode[][];
}> {
  const key = isGraphQLFile(schemaPointer) ? resolve(schemaPointer) : schemaPointer;

  // Get TypeDefinitionNodes from current schema
  const document = getDocumentFromSDL(sdl);

  // Add all definitions to running total
  allDefinitions.push(filterTypeDefinitions(document.definitions));

  // Filter TypeDefinitionNodes by type and defined imports
  const currentTypeDefinitions = filterImportedDefinitions(imports, document.definitions, allDefinitions);

  // Add typedefinitions to running total
  typeDefinitions.push(currentTypeDefinitions);

  // Read imports from current file
  const rawModules = parseSDL(sdl);

  // Process each file (recursively)
  await Promise.all(
    rawModules.map(async m => {
      // If it was not yet processed (in case of circular dependencies)
      const moduleFilePath = resolveModuleFilePath(schemaPointer, m.from);

      const processedFile = processedFiles.get(key);
      if (!processedFile || !processedFile.find(rModule => isEqual(rModule, m))) {
        // Mark this specific import line as processed for this file (for cicular dependency cases)
        processedFiles.set(key, processedFile ? processedFile.concat(m) : [m]);
        const results = await loadTypedefsUsingLoaders(
          loaders,
          moduleFilePath,
          {
            ...options,
            skipGraphQLImport: true,
            forceRawSDL: true,
            forceGraphQLImport: false,
          },
          OPERATION_KINDS,
          cwd
        );
        await Promise.all(
          results.map(async result => {
            const rawSDL = result.rawSDL || print(result.document);
            await collectDefinitions(m.imports, rawSDL, moduleFilePath, loaders, options, cwd, processedFiles, typeDefinitions, allDefinitions);
          })
        );
      }
    })
  );

  // Return the maps of type definitions from each file
  return { allDefinitions, typeDefinitions };
}

/**
 * Filter the types loaded from a schema, first by relevant types,
 * then by the types specified in the import statement.
 *
 * @param imports Types specified in the import statement
 * @param typeDefinitions All definitions from a schema
 * @returns Filtered collection of type definitions
 */
function filterImportedDefinitions(imports: string[], typeDefinitions: ReadonlyArray<DefinitionNode>, allDefinitions: ValidDefinitionNode[][] = []): ValidDefinitionNode[] {
  // This should do something smart with fields

  const filteredDefinitions = filterTypeDefinitions(typeDefinitions);

  if (includes(imports, '*')) {
    if (imports.length === 1 && imports[0] === '*' && allDefinitions.length > 1) {
      const previousTypeDefinitions: { [key: string]: DefinitionNode } = keyBy(
        flatten(allDefinitions.slice(0, allDefinitions.length - 1)).filter(def => !includes(rootFields, def.name.value)),
        def => def.name.value
      );
      return typeDefinitions.filter(typeDef => typeDef.kind === 'ObjectTypeDefinition' && previousTypeDefinitions[typeDef.name.value]) as ObjectTypeDefinitionNode[];
    }
    return filteredDefinitions;
  } else {
    const result = filteredDefinitions.filter(d =>
      includes(
        imports.map(i => i.split('.')[0]),
        d.name.value
      )
    );
    const fieldImports = imports.filter(i => i.split('.').length > 1);
    const groupedFieldImports = groupBy(fieldImports, x => x.split('.')[0]);

    for (const rootType in groupedFieldImports) {
      const fields = groupedFieldImports[rootType].map(x => x.split('.')[1]);
      const objectTypeDefinition: any = filteredDefinitions.find(def => def.name.value === rootType);

      objectTypeDefinition.fields = objectTypeDefinition.fields.filter((f: any) => includes(fields, f.name.value) || includes(fields, '*'));
    }

    return result;
  }
}

/**
 * Filter relevant definitions from schema
 *
 * @param definitions All definitions from a schema
 * @returns Relevant type definitions
 */
function filterTypeDefinitions(definitions: ReadonlyArray<DefinitionNode>): ValidDefinitionNode[] {
  const validKinds = ['DirectiveDefinition', 'ScalarTypeDefinition', 'ObjectTypeDefinition', 'ObjectTypeExtension', 'InterfaceTypeDefinition', 'EnumTypeDefinition', 'UnionTypeDefinition', 'InputObjectTypeDefinition'];
  return definitions.filter(d => includes(validKinds, d.kind)).map(d => d as ValidDefinitionNode);
}
