/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

jest.autoMockOff();

require('configureForRelayOSS');


const {transformASTSchema} = require('ASTConvert');
const RelayCompiler = require('RelayCompiler');
const RelayCompilerContext = require('RelayCompilerContext');
const RelayTestSchema = require('RelayTestSchema');

const getGoldenMatchers = require('getGoldenMatchers');
const invariant = require('invariant');
const parseGraphQLText = require('parseGraphQLText');
const prettyStringify = require('prettyStringify');

describe('RelayCompiler', () => {
  beforeEach(() => {
    jasmine.addMatchers(getGoldenMatchers(__filename));
  });

  it('matches expected output', () => {
    expect('fixtures/compiler').toMatchGolden(text => {
      const relaySchema = transformASTSchema(RelayTestSchema);
      const compiler = new RelayCompiler(
        RelayTestSchema,
        new RelayCompilerContext(relaySchema),
      );
      compiler.addDefinitions(parseGraphQLText(relaySchema, text).definitions);
      return [...compiler.compile().values()].map(
        ({text: queryText, ...ast}) => {
          let stringified = prettyStringify(ast);
          if (queryText) {
            stringified += '\n\nQUERY:\n\n' + queryText;
          }
          return stringified;
        }
      ).join('\n\n');
    });
  });

  it('matches expected validation output', () => {
    expect('fixtures/compiler-validation').toMatchGolden(text => {
      const relaySchema = transformASTSchema(RelayTestSchema);
      const compiler = new RelayCompiler(
        RelayTestSchema,
        new RelayCompilerContext(relaySchema),
      );
      compiler.addDefinitions(parseGraphQLText(relaySchema, text).definitions);
      let error;
      try {
        compiler.compile();
      } catch (_error) {
        error = _error;
      }
      invariant(
        error,
        'RelayCompiler-test: Expected fixture to cause a compilation error.'
      );
      return error.message;
    });
  });
});
