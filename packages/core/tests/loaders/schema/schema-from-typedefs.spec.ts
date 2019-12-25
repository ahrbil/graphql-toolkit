import { loadSchema } from '@graphql-toolkit/core';
import { GraphQLFileLoader } from '@graphql-toolkit/graphql-file-loader';
import { CodeFileLoader } from '@graphql-toolkit/code-file-loader';

describe('schema from typedefs', () => {
  it('should work with glob correctly', async () => {
    const glob = './tests/loaders/schema/test-files/schema-dir/query.graphql';
    const schema = await loadSchema(glob, {
      loaders: [new GraphQLFileLoader()]
    });

    expect(schema.getTypeMap()['User']).toBeDefined();
    expect(schema.getTypeMap()['Query']).toBeDefined();
  });

  it('should ignore empty files when using glob expressions', async () => {
    const glob = './tests/loaders/schema/test-files/schema-dir/*.empty.graphql';

    try {
      await loadSchema(glob, {
        loaders: [new GraphQLFileLoader()]
      });
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.message).toBe(`Unable to find any GraphQL type definitions for the following pointers: ./tests/loaders/schema/test-files/schema-dir/*.empty.graphql`);
    }
  });

  it('should point to a broken file with parsing error message', async () => {
    const glob = './tests/loaders/schema/test-files/schema-dir/*.broken.graphql';

    try {
      const schema = await loadSchema(glob, {
        loaders: [new GraphQLFileLoader()]
      });
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.message).toMatch('Unable to find any GraphQL type definitions for the following pointers');
    }
  });

  it('should ignore graphql documents when loading a scehma', async () => {
    const glob = './tests/loaders/schema/test-files/schema-dir/*.non-schema.graphql';

    try {
      const schema = await loadSchema(glob, {
        loaders: [new GraphQLFileLoader()]
      });
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.message).toBe(`Unable to find any GraphQL type definitions for the following pointers: ./tests/loaders/schema/test-files/schema-dir/*.non-schema.graphql`);
    }
  });

  it('should work with graphql-tag', async () => {
    const schemaPath = './tests/loaders/schema/test-files/schema-dir/*.ts';

    const schema = await loadSchema(schemaPath, {
      loaders: [new CodeFileLoader()]
    });

    expect(schema.getTypeMap()['User']).toBeDefined();
    expect(schema.getTypeMap()['Query']).toBeDefined();
  });

  it('should work without globs correctly', async () => {
    const schemaPath = './tests/loaders/schema/test-files/schema-dir/type-defs/graphql-tag.ts';
    const schema = await loadSchema(schemaPath, {
      loaders: [new CodeFileLoader()]
    });

    expect(schema.getTypeMap()['User']).toBeDefined();
    expect(schema.getTypeMap()['Query']).toBeDefined();
  });

  it('should work with import notations', async () => {
    const schemaPath = './tests/loaders/schema/test-files/schema-dir/query.graphql';
    const schema = await loadSchema(schemaPath, {
      loaders: [new GraphQLFileLoader()]
    });

    expect(schema.getTypeMap()['User']).toBeDefined();
    expect(schema.getTypeMap()['Query']).toBeDefined();
  });

  it('should work with extensions (static graphql file)', async () => {
    const schemaPath = './tests/loaders/schema/test-files/schema-dir/extensions/schema-with-extend.graphql';
    const schema = await loadSchema(schemaPath, {
      loaders: [new GraphQLFileLoader()]
    });
    const queryFields = Object.keys(schema.getQueryType().getFields());

    expect(queryFields).toContain('foo');
    expect(queryFields).toContain('bar');
  });

  it('should work with extensions (multiple graphql files)', async () => {
    const schemaPath = './tests/loaders/schema/test-files/schema-dir/extensions/*.graphql';
    const schema = await loadSchema(schemaPath, {
      loaders: [new GraphQLFileLoader()]
    });
    const queryFields = Object.keys(schema.getQueryType().getFields());

    expect(queryFields).toContain('foo');
    expect(queryFields).toContain('bar');
    expect(queryFields).toContain('baz');
  });

  it('should work with extensions (static js file with typedefs)', async () => {
    const schemaPath = './tests/loaders/schema/test-files/schema-dir/extensions/type-defs.js';
    const schema = await loadSchema(schemaPath, {
      loaders: [new CodeFileLoader()]
    });
    const queryFields = Object.keys(schema.getQueryType().getFields());

    expect(queryFields).toContain('foo');
    expect(queryFields).toContain('bar');
  });
});
