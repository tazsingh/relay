/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

jest.disableAutomock();

describe('RelayCompilerContext', () => {
  let GraphQL;
  let RelayCompilerContext;
  let RelayParser;
  let RelayTestSchema;
  let RelayStaticTestUtils;

  let queryFoo;
  let fragmentBar;
  let fragmentFoo;

  beforeEach(() => {
    jest.resetModules();
    RelayCompilerContext = require('RelayCompilerContext');
    RelayParser = require('RelayParser');
    RelayTestSchema = require('RelayTestSchema');
    RelayStaticTestUtils = require('RelayStaticTestUtils');

    GraphQL = require('graphql');

    jasmine.addMatchers(RelayStaticTestUtils.matchers);

    [
      queryFoo,
      fragmentFoo,
      fragmentBar,
    ] = RelayParser.parse(RelayTestSchema, `
      query Foo { node(id: 1) { ...Bar } }
      fragment Foo on Node { id }
      fragment Bar on Node { id }
    `);
  });

  describe('add()', () => {
    it('adds multiple roots', () => {
      const context = [queryFoo, fragmentBar].reduce(
        (ctx, node) => ctx.add(node),
        new RelayCompilerContext(RelayTestSchema)
      );

      expect(context.getRoot('Foo')).toBe(queryFoo);
      expect(context.getFragment('Bar')).toBe(fragmentBar);
    });

    it('throws if the root names are not unique', () => {
      expect(() => {
        [queryFoo, fragmentFoo].reduce(
          (ctx, node) => ctx.add(node),
          new RelayCompilerContext(RelayTestSchema)
        );
      }).toFailInvariant(
        'RelayCompilerContext: Duplicate document named `Foo`. GraphQL ' +
        'fragments and roots must have unique names.'
      );
    });
  });
  describe('extendSchema()', () => {
    it('returns new context for schema extending query', () => {
      const prevContext = new RelayCompilerContext(RelayTestSchema);
      const ast = GraphQL.parse(`
        extend type User {
          best_friends: FriendsConnection
        }
      `);
      const {context, schema} = prevContext.extendSchema(ast);

      expect(context).not.toEqual(prevContext);
      expect(schema).not.toEqual(RelayTestSchema);
      const extendedQuery = `
        fragment Bar on User {
          best_friends {
            edges {
              node {id}
            }
          }
        }
      `;
      expect(() => prevContext.parse(extendedQuery)).toThrow();
      expect(() => context.parse(extendedQuery)).not.toThrow();
    });

    it('returns same context for normal query', () => {
      const prevContext = new RelayCompilerContext(RelayTestSchema);
      const ast = GraphQL.parse(`
        fragment Foo on User {
          id
        }
      `);
      const {context, schema} = prevContext.extendSchema(ast);
      expect(context).toEqual(prevContext);
      expect(schema).toEqual(RelayTestSchema);
    });
  });
});
