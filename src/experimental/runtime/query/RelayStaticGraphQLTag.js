/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayStaticGraphQLTag
 * @flow
 */

'use strict';

const RelayGraphQLTagMap = require('RelayGraphQLTagMap');

const invariant = require('invariant');

import type {
  ConcreteFragmentDefinition,
  ConcreteOperationDefinition,
} from 'ConcreteQuery';
import type {
  ConcreteBatch,
  ConcreteFragment,
} from 'RelayConcreteNode';

// The type of a graphql`...` tagged template expression.
export type GraphQLTaggedNode = {
  relay: () => ConcreteFragmentDefinition | ConcreteOperationDefinition,
  relayExperimental: () => ConcreteFragment | ConcreteBatch,
};

/**
 * A map used to memoize the results of executing the Relay 2 functions from
 * graphql`...` tagged expressions. Memoization allows the framework to use
 * object equality checks to compare fragments (useful, for example, when
 * comparing two `Selector`s to see if they select the same data).
 */
const nodeMap = new RelayGraphQLTagMap();

/**
 * Runtime function to correspond to the `graphql` tagged template function.
 * All calls to this function should be transformed by the plugin.
 */
function graphql(): GraphQLTaggedNode {
  invariant(
    false,
    'graphql: Unexpected invocation at runtime. Either the Babel transform ' +
    'was not set up, or it failed to identify this call site. Make sure it ' +
    'is being used verbatim as `graphql`.'
  );
}

/**
 * Variant of the `graphql` tag that enables experimental features.
 */
graphql.experimental = function(): GraphQLTaggedNode {
  invariant(
    false,
    'graphql.experimental: Unexpected invocation at runtime. Either the ' +
    'Babel transform was not set up, or it failed to identify this call ' +
    'site. Make sure it is being used verbatim as `graphql`.'
  );
};

function getFragment(
  taggedNode: GraphQLTaggedNode,
): ConcreteFragment {
  let fragment = nodeMap.get(taggedNode);
  if (fragment == null) {
    // TODO: unify tag output
    const fn = taggedNode.relayExperimental;
    fragment = fn != null ?
      fn() :
      (taggedNode: any); // support legacy tags that output raw nodes
    nodeMap.set(taggedNode, fragment);
  }
  invariant(
    typeof fragment === 'object' && fragment !== null && fragment.kind === 'Fragment',
    'RelayStaticGraphQLTag: Expected a fragment, got `%s`.',
    JSON.stringify(fragment),
  );
  return (fragment: any);
}

function getOperation(
  taggedNode: GraphQLTaggedNode,
): ConcreteBatch {
  let operation = nodeMap.get(taggedNode);
  if (operation == null) {
    // TODO: unify tag output
    const fn = taggedNode.relayExperimental;
    operation = fn != null ?
      fn() :
      (taggedNode: any); // support legacy tags that output raw nodes
    nodeMap.set(taggedNode, operation);
  }
  invariant(
    typeof operation === 'object' && operation !== null && operation.kind === 'Batch',
    'RelayStaticGraphQLTag: Expected an operation, got `%s`.',
    JSON.stringify(operation),
  );
  return (operation: any);
}

module.exports = {
  getFragment,
  getOperation,
  graphql,
};
