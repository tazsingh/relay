/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @providesModule RelayViewerHandleTransform
 */

'use strict';

const RelayCompilerContext = require('RelayCompilerContext');
const RelayIRTransformer = require('RelayIRTransformer');

const invariant = require('invariant');

const {getRawType} = require('RelaySchemaUtils');

import type {LinkedField} from 'RelayIR';
import type {GraphQLSchema, GraphQLType} from 'graphql';

type State = GraphQLType;

const VIEWER_HANDLE = 'viewer';
const VIEWER_TYPE = 'Viewer';

/**
 * A transform that adds a "viewer" handle to all fields whose type is `Viewer`.
 */
function transform(
  context: RelayCompilerContext,
  schema: GraphQLSchema
): RelayCompilerContext {
  const viewerType = schema.getType(VIEWER_TYPE);
  invariant(
    viewerType,
    'RelayViewerHandleTransform: Expected the schema to have a `%s` type, ' +
    'cannot transform context.',
    VIEWER_TYPE
  );
  return RelayIRTransformer.transform(
    context,
    {
      LinkedField: visitLinkedField,
    },
    () => viewerType
  );
}

function visitLinkedField(field: LinkedField, state: State): ?LinkedField {
  const transformedNode = this.traverse(field, state);
  if (getRawType(field.type) !== state) {
    return transformedNode;
  }
  let handles = transformedNode.handles;
  if (handles && !handles.indexOf(VIEWER_HANDLE)) {
    handles = [...handles, VIEWER_HANDLE];
  } else if (!handles) {
    handles = [VIEWER_HANDLE];
  }
  return handles !== transformedNode.handles ?
    {...transformedNode, handles} :
    transformedNode;
}

module.exports = {transform};
