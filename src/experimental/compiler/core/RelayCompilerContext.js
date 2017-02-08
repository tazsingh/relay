/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @providesModule RelayCompilerContext
 */

'use strict';

const GraphQL = require('graphql');
const RelayParser = require('RelayParser');
const RelayValidator = require('RelayValidator');

const idx = require('idx');
const immutable = require('immutable');
const invariant = require('invariant');

const {getOperationDefinitionAST} = require('RelaySchemaUtils');

import type {
  Fragment,
  Root,
} from 'RelayIR';
import type {DocumentNode, GraphQLSchema} from 'graphql';

const {
  List: ImmutableList,
  OrderedMap: ImmutableOrderedMap,
  Record,
} = immutable;

const Document = Record({
  errors: null,
  name: null,
  node: null,
});

type ContextAndNodes = $Exact<{
  context: RelayCompilerContext,
  nodes: Array<Root | Fragment>,
}>;

type ContextAndSchema = $Exact<{
  context: RelayCompilerContext,
  schema: GraphQLSchema,
}>;

/**
 * An immutable representation of a corpus of documents being compiled together.
 * For each document, the context stores the IR and any validation errors.
 */
class RelayCompilerContext {
  _documents: ImmutableOrderedMap<string, Document>;
  schema: GraphQLSchema;

  constructor(schema: GraphQLSchema) {
    this._documents = new ImmutableOrderedMap();
    this.schema = schema;
  }

  /**
   * Returns the documents for the context in the order they were added.
   */
  documents(): Array<Fragment | Root> {
    return this._documents.valueSeq().map(doc => doc.get('node')).toJS();
  }

  parse(text: string): ContextAndNodes {
    const ast = GraphQL.parse(text);
    invariant(
      ast.definitions.length,
      'RelayCompilerContext: Expected GraphQL text to contain at least one ' +
      'definition (fragment, mutation, query, subscription), got `%s`.',
      text
    );
    return this.parseAST(ast);
  }

  parseAST(ast: DocumentNode): ContextAndNodes {
    const contextAndSchema = this.extendSchema(ast);
    let context = contextAndSchema.context;
    const schema = contextAndSchema.schema;
    try {
      RelayValidator.validate(ast, schema, RelayValidator.LOCAL_RULES);
    } catch (e) {
      const errorMessages = [];
      const text = idx(ast, _ => _.loc.source.body);
      if (e.validationErrors && text) {
        const sourceLines = text.split('\n');
        e.validationErrors.forEach(function (formattedError) {
          const {message, locations} = formattedError;
          let errorMessage = message;
          locations.forEach(function (location) {
            var preview = sourceLines[location.line - 1];
            if (preview) {
              errorMessage += '\n' + [
                '> ',
                '> ' + preview,
                '> ' + ' '.repeat(location.column - 1) + '^^^',
              ].join('\n');
            }
          });
          errorMessages.push(errorMessage);
        });
        invariant(
          false,
          'RelayCompilerContext: Encountered following errors while parsing.' +
          ' \n %s',
          errorMessages.join('\n')
        );
      } else {
        throw e;
      }
    }
    const nodes = [];
    ast.definitions.forEach(definition => {
      const operationDefinition = getOperationDefinitionAST(definition);
      if (operationDefinition) {
        const node = RelayParser.transform(schema, operationDefinition);
        nodes.push(node);
        context = context.add(node);
      }
    });
    return {context, nodes};
  }

  add(node: Fragment | Root): RelayCompilerContext {
    invariant(
      !this._documents.has(node.name),
      'RelayCompilerContext: Duplicate document named `%s`. GraphQL ' +
      'fragments and roots must have unique names.',
      node.name
    );
    return this._update(
      this._documents.set(node.name, new Document({
        name: node.name,
        node,
      }))
    );
  }

  addError(name: string, error: Error): RelayCompilerContext {
    const record = this._get(name);
    let errors = record.get('errors');
    if (errors) {
      errors = errors.push(error);
    } else {
      errors = ImmutableList([error]);
    }
    return this._update(
      this._documents.set(name, record.set('errors', errors))
    );
  }

  extendSchema(ast: DocumentNode): ContextAndSchema {
    const schema = GraphQL.extendSchema(this.schema, ast);
    let context = this; // eslint-disable-line consistent-this
    if (schema !== this.schema) {
      context = new RelayCompilerContext(schema);
      context._documents = this._documents;
    }
    return {context, schema};
  }

  get(name: string): ?(Fragment | Root) {
    const record = this._documents.get(name);
    return record && record.get('node');
  }

  getFragment(name: string): Fragment {
    const record = this._documents.get(name);
    const node = record && record.get('node');
    invariant(
      node && node.kind === 'Fragment',
      'RelayCompilerContext: Expected `%s` to be a fragment, got `%s`.',
      name,
      node && node.kind
    );
    return node;
  }

  getRoot(name: string): Root {
    const record = this._documents.get(name);
    const node = record && record.get('node');
    invariant(
      node && node.kind === 'Root',
      'RelayCompilerContext: Expected `%s` to be a root, got `%s`.',
      name,
      node && node.kind
    );
    return node;
  }

  getErrors(name: string): ?ImmutableList<Error> {
    return this._get(name).get('errors');
  }

  remove(name: string): RelayCompilerContext {
    return this._update(
      this._documents.delete(name)
    );
  }

  _get(name: string): Document {
    const record = this._documents.get(name);
    invariant(
      record,
      'RelayCompilerContext: Unknown document `%s`.',
      name
    );
    return record;
  }

  _update(documents: ImmutableOrderedMap<string, Document>): RelayCompilerContext {
    const context = new RelayCompilerContext(this.schema);
    context._documents = documents;
    return context;
  }
}

module.exports = RelayCompilerContext;
