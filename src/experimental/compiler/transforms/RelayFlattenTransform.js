/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayFlattenTransform
 */

'use strict';

const RelayCompilerContext = require('RelayCompilerContext');
const RelaySchemaUtils = require('RelaySchemaUtils');

const areEqual = require('areEqual');
const getIdentifierForRelaySelection = require('getIdentifierForRelaySelection');
const invariant = require('invariant');

import type {
  Field,
  Node,
  Root,
  ScalarField,
  Selection,
  Type,
} from 'RelayIR';

const {getRawType, isAbstractType} = RelaySchemaUtils;

export type FlattenOptions = {
  flattenAbstractTypes?: boolean,
  flattenFragmentSpreads?: boolean,
  flattenInlineFragments?: boolean,
  flattenConditions?: boolean,
};
type FlattenState = {
  kind: 'FlattenState',
  node: Node,
  selections: {[key: string]: FlattenState | ScalarField},
  type: Type,
};

/**
 * Transform that flattens inline fragments, fragment spreads, and conditionals.
 *
 * Inline fragments are inlined (replaced with their selections) when:
 * - The fragment type matches the type of its parent.
 * - The fragment has an abstract type and the `flattenAbstractTypes` option has
 *   been set.
 * - The 'flattenInlineFragments' option has been set.
 *
 * Fragment spreads are inlined when the `flattenFragmentSpreads` option is set.
 * In this case the fragment is converted to an inline fragment, which is
 * then inlined according to the rules above.
 *
 * Conditions are inlined when the `flattenConditions` option is set.
 * In this case the condition is converted to an inline fragment, which is then
 * inlined according to the rules above.
 */
function transform(
  context: RelayCompilerContext,
  options?: FlattenOptions
): RelayCompilerContext {
  options = {
    flattenAbstractTypes: !!(options && options.flattenAbstractTypes),
    flattenFragmentSpreads: !!(options && options.flattenFragmentSpreads),
    flattenInlineFragments: !!(options && options.flattenInlineFragments),
    flattenConditions: !!(options && options.flattenConditions),
  };
  return context.documents().reduce((ctx, node) => {
    if (options.flattenFragmentSpreads && node.kind === 'Fragment') {
      return ctx;
    }
    const state = {
      kind: 'FlattenState',
      node,
      selections: {},
      type: node.type,
    };
    visitNode(context, options, state, node);
    const flattenedNode = buildNode(state);
    invariant(
      flattenedNode.kind === 'Root' || flattenedNode.kind === 'Fragment',
      'RelayFlattenTransform: Expected Root `%s` to flatten back to a Root ' +
      ' or Fragment.',
      node.name
    );
    return ctx.add(flattenedNode);
  }, new RelayCompilerContext(context.schema));
}

function buildNode(state: FlattenState): Root | Selection {
  return {
    ...state.node,
    selections: Object.values(state.selections).map(selectionState => {
      if (
        selectionState.kind === 'FragmentSpread' ||
        selectionState.kind === 'ScalarField'
      ) {
        return selectionState;
      } else if (selectionState.kind === 'FlattenState') {
        const node = buildNode(selectionState);
        invariant(
          node.kind !== 'Root' && node.kind !== 'Fragment',
          'RelayFlattenTransform: got a `%s`, expected a selection.',
          node.kind
        );
        return node;
      } else {
        // $FlowIssue: this is provably unreachable
        invariant(
          false,
          'RelayFlattenTransform: Unexpected kind `%s`.',
          selectionState.kind
        );
      }
    }),
  };
}

/**
 * @internal
 */
function visitNode(
  context: RelayCompilerContext,
  options: FlattenOptions,
  state: FlattenState,
  node: Node
): void {
  node.selections.forEach(selection => {
    if (
      selection.kind === 'FragmentSpread' &&
      options.flattenFragmentSpreads
    ) {
      invariant(
        !selection.args.length,
        'RelayFlattenTransform: Cannot flatten fragment spread `%s` with ' +
        'arguments. Use the `ApplyFragmentArgumentTransform` before flattening',
        selection.name
      );
      const fragment = context.get(selection.name);
      invariant(
        fragment && fragment.kind === 'Fragment',
        'RelayFlattenTransform: Unknown fragment `%s`.',
        selection.name
      );
      // Replace the spread with an inline fragment containing the fragment's
      // contents
      selection = {
        directives: selection.directives,
        kind: 'InlineFragment',
        selections: fragment.selections,
        typeCondition: fragment.type,
      };
    }
    if (selection.kind === 'Condition' && options.flattenConditions) {
      selection = {
        directives: [],
        kind: 'InlineFragment',
        selections: selection.selections,
        typeCondition: state.type,
      };
    }
    if (
      selection.kind === 'InlineFragment' &&
      shouldFlattenFragment(selection, options, state)
    ) {
      visitNode(context, options, state, selection);
      return;
    }
    const nodeIdentifier = getIdentifierForRelaySelection(selection);
    if (selection.kind === 'Condition' || selection.kind === 'InlineFragment') {
      let selectionState = state.selections[nodeIdentifier];
      if (!selectionState) {
        selectionState = state.selections[nodeIdentifier] = {
          kind: 'FlattenState',
          node: selection,
          selections: {},
          type: selection.kind === 'InlineFragment' ?
            selection.typeCondition :
            selection.type,
        };
      }
      visitNode(context, options, selectionState, selection);
    } else if (selection.kind === 'FragmentSpread') {
      state.selections[nodeIdentifier] = selection;
    } else if (selection.kind === 'LinkedField') {
      let selectionState = state.selections[nodeIdentifier];
      if (!selectionState) {
        selectionState = state.selections[nodeIdentifier] = {
          kind: 'FlattenState',
          node: selection,
          selections: {},
          type: selection.type,
        };
      } else {
        const prevSelection = selectionState.node;
        // Validate unique args for a given alias
        invariant(
          areEqualFields(selection, prevSelection),
          'RelayFlattenTransform: Expected all fields with the alias `%s` ' +
          'to have the same name/arguments. Got `%s` and `%s`.',
          nodeIdentifier,
          showField(selection),
          showField(prevSelection)
        );
        // merge fields
        const handles = dedupe(prevSelection.handles, selection.handles);
        selectionState.node = {
          ...selection,
          handles,
        };
      }
      visitNode(context, options, selectionState, selection);
    } else if (selection.kind === 'ScalarField') {
      const prevSelection = state.selections[nodeIdentifier];
      if (prevSelection) {
        invariant(
          areEqualFields(selection, prevSelection),
          'RelayFlattenTransform: Expected all fields with the alias `%s` ' +
          'to have the same name/arguments. Got `%s` and `%s`.',
          nodeIdentifier,
          showField(selection),
          showField(prevSelection)
        );
        if (selection.handles || prevSelection.handles) {
          const handles = dedupe(selection.handles, prevSelection.handles);
          selection = {
            ...selection,
            handles,
          };
        }
      }
      state.selections[nodeIdentifier] = selection;
    } else {
      invariant(
        false,
        'RelayFlattenTransform: Unknown kind `%s`.',
        selection.kind
      );
    }
  });
}

/**
 * @internal
 */
function shouldFlattenFragment(
  fragment: InlineFragment,
  options: FlattenOptions,
  state: FlattenState
): boolean {
  return (
    fragment.typeCondition === state.type ||
    options.flattenInlineFragments ||
    (
      options.flattenAbstractTypes &&
      isAbstractType(getRawType(fragment.typeCondition))
    )
  );
}

/**
 * @internal
 */
function showField(field: Field) {
  const alias = field.alias ? field.alias + ' ' : '';
  return `${alias}${field.name}(${JSON.stringify(field.args)})`;
}

/**
 * @internal
 *
 * Verify that two fields are equal in all properties other than their
 * selections.
 */
function areEqualFields(
  thisField: Field,
  thatField: Field
): boolean {
  return (
    thisField.kind === thatField.kind &&
    thisField.name === thatField.name &&
    thisField.alias === thatField.alias &&
    areEqual(thisField.args, thatField.args)
  );
}

/**
 * @internal
 */
function dedupe(...arrays: Array<?Array<string>>): Array<string> {
  const uniqueItems = new Set();
  arrays.forEach(items => {
    items && items.forEach(item => {
      uniqueItems.add(item);
    });
  });
  return Array.from(uniqueItems.values());
}

module.exports = {transform};
