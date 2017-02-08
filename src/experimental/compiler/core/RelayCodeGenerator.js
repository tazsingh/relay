/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayCodeGenerator
 */

'use strict';

const GraphQL = require('graphql');
const RelaySchemaUtils = require('RelaySchemaUtils');
const RelayStoreUtils = require('RelayStoreUtils');

const invariant = require('invariant');
const prettyStringify = require('prettyStringify');

import type {
  ConcreteArgument,
  ConcreteArgumentDefinition,
  ConcreteFragment,
  ConcreteRoot,
  ConcreteSelection,
} from 'RelayConcreteNode';
import type {
  Argument,
  ArgumentDefinition,
  Fragment,
  Root,
  Selection,
  Type,
} from 'RelayIR';

const {GraphQLList} = GraphQL;
const {
  getRawType,
  isAbstractType,
  getNullableType,
} = RelaySchemaUtils;
const {formatStorageKey} = RelayStoreUtils;

/**
 * @public
 *
 * Converts a Relay IR node into a plain JS object representation that can be
 * used at runtime.
 */
function generate(node: Root | Fragment): ConcreteRoot | ConcreteFragment {
  const generator = new RelayCodeGenerator(node);
  return generator.generate();
}

class RelayCodeGenerator {
  _node: Root | Fragment;

  constructor(node: Root | Fragment) {
    this._node = node;
  }

  _getErrorMessage(): string {
    return `document ${this._node.name}`;
  }

  generate(): ConcreteRoot | ConcreteFragment {
    const node = this._node;
    if (node.kind === 'Root') {
      return {
        argumentDefinitions:
          this._generateArgumentDefinitions(node.argumentDefinitions),
        kind: 'Root',
        name: node.name,
        operation: node.operation,
        selections: this._generateSelections(node.selections),
      };
    } else if (node.kind === 'Fragment') {
      return {
        argumentDefinitions:
          this._generateArgumentDefinitions(node.argumentDefinitions),
        kind: 'Fragment',
        metadata: node.metadata || null,
        name: node.name,
        selections: this._generateSelections(node.selections),
        type: node.type.toString(),
      };
    } else {
      invariant(
        false,
        'RelayCodeGenerator: Unknown AST kind `%s`. Source: %s.',
        node.kind,
        this._getErrorMessage()
      );
    }
  }

  _generateArgumentDefinitions(
    definitions: Array<ArgumentDefinition>
  ): Array<ConcreteArgumentDefinition> {
    return definitions.map(def => {
      if (def.kind === 'LocalArgumentDefinition') {
        return {
          kind: 'LocalArgument',
          name: def.name,
          type: def.type.toString(),
          defaultValue: def.defaultValue,
        };
      } else {
        return {
          kind: 'RootArgument',
          name: def.name,
          type: def.type ?
            def.type.toString() :
            null,
        };
      }
    });
  }

  _generateSelections(
    selections: Array<Selection>,
  ): Array<ConcreteSelection> {
    const concreteSelections = [];
    selections.forEach(selection => {
      const generatedSelections = this._generateSelection(selection);
      if (Array.isArray(generatedSelections)) {
        concreteSelections.push(...generatedSelections);
      } else {
        concreteSelections.push(generatedSelections);
      }
    });
    return concreteSelections;
  }

  _generateSelection(
    selection: Selection
  ): ConcreteSelection | Array<ConcreteSelection> {
    switch (selection.kind) {
      case 'Condition':
        invariant(
          selection.condition.kind === 'Variable',
          'RelayCodeGenerator: Expected static `Condition` node to be ' +
          'pruned or inlined. Source: %s.',
          this._getErrorMessage()
        );
        return {
          kind: 'Condition',
          passingValue: selection.passingValue,
          condition: selection.condition.variableName,
          selections: this._generateSelections(selection.selections),
        };
      case 'FragmentSpread':
        return {
          kind: 'FragmentSpread',
          name: selection.name,
          args: this._generateArguments(selection.args),
        };
      case 'InlineFragment':
        return {
          kind: 'InlineFragment',
          type: selection.typeCondition.toString(),
          selections: this._generateSelections(selection.selections),
        };
      case 'LinkedField':
      case 'ScalarField':
        {
          const generatedSelections = [];
          const args = this._generateArguments(selection.args);
          if (selection.kind === 'LinkedField') {
            const type = getRawType(selection.type);
            generatedSelections.push({
              kind: 'LinkedField',
              alias: selection.alias,
              args,
              concreteType: !isAbstractType(type) ?
                type.toString() :
                null,
              name: selection.name,
              plural: isPlural(selection.type),
              selections: this._generateSelections(selection.selections),
              storageKey: getStorageKey(selection.name, args),
            });
          } else {
            generatedSelections.push({
              kind: 'ScalarField',
              alias: selection.alias,
              args,
              name: selection.name,
              storageKey: getStorageKey(selection.name, args),
            });
          }
          selection.handles && selection.handles.forEach(handle => {
            generatedSelections.push({
              kind: selection.kind === 'LinkedField' ?
                'LinkedHandle' :
                'ScalarHandle',
              alias: selection.alias,
              args,
              handle,
              name: selection.name,
            });
          });
          return generatedSelections;
        }
      default:
        invariant(
          false,
          'RelayCodeGenerator: Unexpected AST kind `%s`. Source: %s',
          selection.kind,
          this._getErrorMessage()
        );
    }
  }

  _generateArguments(
    args: Array<Argument>
  ): ?Array<ConcreteArgument> {
    const generatedArgs = [];
    args.forEach(arg => {
      if (arg.value.kind === 'Variable') {
        generatedArgs.push({
          kind: 'Variable',
          name: arg.name,
          variableName: arg.value.variableName,
          type: arg.type ?
            arg.type.toString() :
            null,
        });
      } else if (arg.value.kind === 'Literal') {
        if (arg.value.value != null) {
          generatedArgs.push({
            kind: 'Literal',
            name: arg.name,
            value: arg.value.value,
            type: arg.type ?
              arg.type.toString() :
              null,
          });
        }
      } else {
        invariant(
          false,
          'RelayCodeGenerator: Complex argument values (Lists or ' +
          'InputObjects with nested variables) are not supported, argument ' +
          '`%s` had value `%s`. Source: %s.',
          arg.name,
          prettyStringify(arg.value),
          this._getErrorMessage()
        );
      }
    });
    if (!generatedArgs.length) {
      return null;
    }
    return generatedArgs.sort((a, b) => (
      a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)
    ));
  }
}

function isPlural(type: Type): boolean {
  return getNullableType(type) instanceof GraphQLList;
}

/**
 * Computes storage key if possible.
 *
 * Storage keys which can be known ahead of runtime are:
 *
 * - Fields that do not take arguments.
 * - Fields whose arguments are all statically known (ie. literals) at build
 *   time.
 */
function getStorageKey(
  fieldName: string,
  args: ?Array<ConcreteArgument>
): ?string {
  if (!args || !args.length) {
    return null;
  }
  let isLiteral = true;
  const preparedArgs = {};
  args.forEach(({name, kind, value}) => {
    if (kind !== 'Literal') {
      isLiteral = false;
    } else {
      preparedArgs[name] = value;
    }
  });
  return isLiteral ? formatStorageKey(fieldName, preparedArgs) : null;
}

module.exports = {generate};
