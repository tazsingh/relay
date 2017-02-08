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

const RelayCompiler = require('RelayCompiler');
const RelayTestSchema = require('RelayTestSchema');

const getGoldenMatchers = require('getGoldenMatchers');
const invariant = require('invariant');
const prettyStringify = require('prettyStringify');

describe('RelayCompiler', () => {
  beforeEach(() => {
    jasmine.addMatchers(getGoldenMatchers(__filename));
  });

  it('matches expected output', () => {
    expect('fixtures/compiler').toMatchGolden(text => {
      const compiler = new RelayCompiler(RelayTestSchema);
      compiler.add(text);
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
      const compiler = new RelayCompiler(RelayTestSchema);
      compiler.add(text);
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
