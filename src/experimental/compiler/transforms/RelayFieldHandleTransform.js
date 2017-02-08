/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayFieldHandleTransform
 * @flow
 */

'use strict';

const RelayCompilerContext = require('RelayCompilerContext');
const RelayIRTransformer = require('RelayIRTransformer');

const getRelayHandleName = require('getRelayHandleName');
const invariant = require('invariant');

import type {Field} from 'RelayIR';
import type {GraphQLSchema} from 'graphql';

type State = true;

function transform(
  context: RelayCompilerContext,
  schema: GraphQLSchema
): RelayCompilerContext {
  return RelayIRTransformer.transform(
    context,
    {
      LinkedField: visitField,
      ScalarField: visitField,
    },
    () => true
  );
}

/**
 * @internal
 */
function visitField<F: Field>(field: F, state: State): F {
  if (field.kind === 'LinkedField') {
    field = this.traverse(field, state);
  }
  const handles = field.handles;
  if (!handles || !handles.length) {
    return field;
  }
  // ensure exactly one handle
  invariant(
    handles.length === 1,
    'RelayFieldHandleTransform: Expected fields to have at most one ' +
    '"handle" property, got `%s`.',
    handles.join(', ')
  );
  const alias = field.alias || field.name;
  const handle = handles[0];
  const name = getRelayHandleName(field.name, handle);
  return ({
    ...field,
    alias,
    args: [],
    name,
    handles: null,
  }: $FlowIssue);
}

module.exports = {transform};
