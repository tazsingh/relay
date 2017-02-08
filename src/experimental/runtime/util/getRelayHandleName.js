/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @providesModule getRelayHandleName
 */

'use strict';

/**
 * @internal
 *
 * Helper to create a unique name for a handle field based on the source field
 * name and the handle.
 */
function getRelayHandleName(fieldName: string, handle: string): string {
  return `__${fieldName}_${handle}`;
}

module.exports = getRelayHandleName;
