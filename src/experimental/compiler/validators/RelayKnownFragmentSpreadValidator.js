/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayKnownFragmentSpreadValidator
 * @flow
 */

'use strict';

const RelayIRVisitor = require('RelayIRVisitor');

import type RelayCompilerContext from 'RelayCompilerContext';

/**
 * Ensure that all fragment spreads reference defined fragments.
 */
function validate(
  context: RelayCompilerContext,
): Array<string> {
  const errors: Array<string> = [];
  context.documents().forEach(node => {
    RelayIRVisitor.visit(node, {
      FragmentSpread(spread) {
        const fragment = context.get(spread.name);
        if (fragment == null) {
          errors.push(
            `Unknown fragment \`${spread.name}\` referenced from \`${node.name}\`.`
          );
        }
      },
    });
  });
  return errors;
}

module.exports = {validate};
