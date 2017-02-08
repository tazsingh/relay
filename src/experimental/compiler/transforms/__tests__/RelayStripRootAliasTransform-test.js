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

const RelayCompilerContext = require('RelayCompilerContext');
const RelayPrinter = require('RelayPrinter');
const RelayStripRootAliasTransform = require('RelayStripRootAliasTransform');
const RelayTestSchema = require('RelayTestSchema');
const getGoldenMatchers = require('getGoldenMatchers');

describe('RelayStripRootAliasTransform', () => {
  beforeEach(() => {
    jasmine.addMatchers(getGoldenMatchers(__filename));
  });

  it('matches expected output', () => {
    expect('fixtures/root-alias-transform').toMatchGolden(text => {
      const context = (new RelayCompilerContext(RelayTestSchema))
        .parse(text).context;
      const nextContext = RelayStripRootAliasTransform.transform(context);
      return nextContext.documents()
        .map(doc => RelayPrinter.print(doc))
        .join('\n');
    });
  });
});
