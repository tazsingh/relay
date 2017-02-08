/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule cloneRelayHandleSourceField
 * @flow
 */

'use strict';

const RelayConcreteNode = require('RelayConcreteNode');

const areEqual = require('areEqual');
const getRelayHandleName = require('getRelayHandleName');
const invariant = require('invariant');

import type {
  ConcreteLinkedField,
  ConcreteLinkedHandle,
  ConcreteSelection,
} from 'RelayConcreteNode';

const {LINKED_FIELD} = RelayConcreteNode;

/**
 * @private
 *
 * Creates a clone of the supplied `handleField` by finding the original linked
 * field (on which the handle was declared) among the sibling `selections`, and
 * copying its selections into the clone.
 */
function cloneRelayHandleSourceField(
  handleField: ConcreteLinkedHandle,
  selections: Array<ConcreteSelection>
): ConcreteLinkedField {
  const sourceField = selections.find(source => (
    source.kind === LINKED_FIELD &&
    source.name === handleField.name &&
    source.alias === handleField.alias &&
    areEqual(source.args, handleField.args)
  ));
  invariant(
    sourceField && sourceField.kind === LINKED_FIELD,
    'cloneRelayHandleSourceField: Expected a corresponding source field for ' +
    'handle `%s`.',
    handleField.handle
  );
  const fieldName = getRelayHandleName(handleField.name, handleField.handle);
  const clonedField = {
    ...sourceField,
    args: null,
    name: fieldName,
    storageKey: fieldName,
  };
  return clonedField;
}

module.exports = cloneRelayHandleSourceField;
