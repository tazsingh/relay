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

const RelayCompilerContext = require('RelayCompilerContext');
const RelayKnownFragmentSpreadValidator = require('RelayKnownFragmentSpreadValidator');
const RelayParser = require('RelayParser');
const RelayTestSchema = require('RelayTestSchema');

const getGoldenMatchers = require('getGoldenMatchers');

describe('RelayKnownFragmentSpreadValidator', () => {
  beforeEach(() => {
    jasmine.addMatchers(getGoldenMatchers(__filename));
  });

  it('matches expected output', () => {
    expect('fixtures/known-fragment-spread-validator').toMatchGolden(text => {
      const ast = RelayParser.parse(RelayTestSchema, text);
      const context = ast.reduce(
        (ctx, node) => ctx.add(node),
        new RelayCompilerContext(RelayTestSchema)
      );
      const errors = RelayKnownFragmentSpreadValidator.validate(context);
      return errors.length ?
        errors.join('\n') :
        '(no errors)';
    });
  });
});
