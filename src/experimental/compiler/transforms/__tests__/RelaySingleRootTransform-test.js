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
const RelaySingleRootTransform = require('RelaySingleRootTransform');
const RelayTestSchema = require('RelayTestSchema');
const getGoldenMatchers = require('getGoldenMatchers');

const nullthrows = require('nullthrows');

describe('RelaySingleRootTransform', () => {
  beforeEach(() => {
    jasmine.addMatchers(getGoldenMatchers(__filename));
  });

  it('matches expected output', () => {
    expect('fixtures/single-root-transform').toMatchGolden(text => {
      const context = (new RelayCompilerContext(RelayTestSchema))
        .parse(text).context;
      const roots = context.documents().filter(doc => doc.kind === 'Root');
      const nextContext = RelaySingleRootTransform.transform(
        context,
        nullthrows(roots[0])
      );
      return nextContext.documents()
        .map(doc => RelayPrinter.print(doc))
        .join('\n');
    });
  });
});
