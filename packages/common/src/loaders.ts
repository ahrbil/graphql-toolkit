import { DocumentNode, GraphQLSchema, ParseOptions, BuildSchemaOptions } from 'graphql';
import { GraphQLSchemaValidationOptions } from 'graphql/type/schema';

export declare class Source {
  document?: DocumentNode;
  schema?: GraphQLSchema;
  rawSDL?: string;
  location?: string;
  constructor({ document, location, schema }: { document?: DocumentNode; location?: string; schema?: GraphQLSchema });
}

export type SingleFileOptions = ParseOptions &
  GraphQLSchemaValidationOptions &
  BuildSchemaOptions & {
    noRequire?: boolean;
    cwd?: string;
  };

export type WithList<T> = T | T[];
export type ElementOf<TList> = TList extends Array<infer TElement> ? TElement : never;
export type SchemaPointer = WithList<string>;
export type SchemaPointerSingle = ElementOf<SchemaPointer>;
export type DocumentGlobPathPointer = string;
export type DocumentPointer = WithList<DocumentGlobPathPointer>;
export type DocumentPointerSingle = ElementOf<DocumentPointer>;

export interface Loader<TPointer = string, TOptions extends SingleFileOptions = SingleFileOptions> {
  loaderId(): string;
  canLoad(pointer: TPointer, options?: TOptions): Promise<boolean>;
  load(pointer: TPointer, options?: TOptions): Promise<Source | null>;
}

export type SchemaLoader<TOptions extends SingleFileOptions = SingleFileOptions> = Loader<SchemaPointerSingle, TOptions>;
export type DocumentLoader<TOptions extends SingleFileOptions = SingleFileOptions> = Loader<DocumentPointerSingle, TOptions>;
export type UniversalLoader<TOptions extends SingleFileOptions = SingleFileOptions> = Loader<SchemaPointerSingle | DocumentPointerSingle, TOptions>;
