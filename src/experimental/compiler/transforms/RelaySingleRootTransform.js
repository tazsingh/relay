/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelaySingleRootTransform
 * @flow
 */

'use strict';

const RelayCompilerContext = require('RelayCompilerContext');

const nullthrows = require('nullthrows');

const {visit} = require('RelayIRVisitor');

import type {
  Fragment,
  FragmentSpread,
  Root,
} from 'RelayIR';

/**
 * A transform that creates a context that is the minimal set of
 * Root | Fragment required to send the provided Root query as a query
 * string request.
 *
 * Given a root:
 *
 * ```
 * query ViewerQuery {
 *   viewer {
 *     ...ViewerFragment0
 *   }
 * }
 * ```
 *
 * And some fragments:
 *
 * ```
 * fragment ViewerFragment0 on Viewer {
 *   ...ViewerFragment2
 * }
 * fragment ViewerFragment1 on Viewer {
 *   id
 * }
 * fragment ViewerFragment2 on Viewer {
 *   name
 * }
 * ```
 *
 * This transform will output:
 *
 * ```
 * query ViewerQuery {
 *   viewer {
 *     ...ViewerFragment0
 *   }
 * }
 * fragment ViewerFragment0 on Viewer {
 *   ...ViewerFragment2
 * }
 * fragment ViewerFragment2 on Viewer {
 *   name
 * }
 * ```
 *
 */
function transform(
  context: RelayCompilerContext,
  root: Root
): RelayCompilerContext {
  const docNames: Set<string> = visitSubFragments(
    root,
    context,
    new Set([root.name])
  );
  let ctx = new RelayCompilerContext(context.schema);
  docNames.forEach(name => {
    ctx = ctx.add(nullthrows(context.get(name)));
  });
  return ctx;
}

/**
 * @internal
 *
 * Recursively build the set of fragments the Root depends on.
 */
function visitSubFragments(
  fragment: Fragment | Root,
  context: RelayCompilerContext,
  visited: Set<string>
): Set<string> {
  visit(fragment, {
    FragmentSpread(spread: FragmentSpread) {
      if (!visited.has(spread.name)) {
        visited.add(spread.name);
        visitSubFragments(
          nullthrows(context.get(spread.name)),
          context,
          visited
        );
      }
    },
  });

  return visited;
}

module.exports = {transform};
