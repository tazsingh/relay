/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayStripRootAliasTransform
 * @flow
 */

'use strict';

const RelayCompilerContext = require('RelayCompilerContext');

const invariant = require('invariant');

import type {
  Selection,
} from 'RelayIR';

/**
 * A transform to strip any alias from a root field. This is necessary (for now)
 * as some server endpoints do not support root field aliases.
 */
function transform(context: RelayCompilerContext): RelayCompilerContext {
  const documents = context.documents();
  return (documents: $FlowIssue).reduce((ctx, node) => {
    if (node.kind === 'Root') {
      // Only transform roots, not fragments
      const selections = transformSelections(node.selections);
      return ctx.add({
        ...node,
        selections,
      });
    }
    return ctx.add(node);
  }, new RelayCompilerContext(context.schema));
}

function transformSelections(
  nodeSelections: Array<Selection>
): Array<Selection> {
  return nodeSelections.map(selection => {
    if (selection.kind === 'LinkedField' || selection.kind === 'ScalarField') {
      return ({
        ...selection,
        alias: null,
      }: $FlowIssue);
    } else if (
      selection.kind === 'InlineFragment' ||
      selection.kind === 'Condition'
    ) {
      const selections = transformSelections(selection.selections);
      return ({
        ...selection,
        selections,
      }: $FlowIssue);
    } else if (selection.kind === 'FragmentSpread') {
      invariant(
        false,
        'RelayAutoAliasTransform: Fragment spreads are not supported at the ' +
        'root.',
        selection.kind
      );
    } else {
      invariant(
        false,
        'RelayAutoAliasTransform: Unexpected node kind `%s`.',
        selection.kind
      );
    }
  });
}

module.exports = {transform};
