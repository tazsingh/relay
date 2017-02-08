/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @providesModule RelayCompiler
 */

'use strict';

const RelayApplyFragmentArgumentTransform =
  require('RelayApplyFragmentArgumentTransform');
const RelayCodeGenerator = require('RelayCodeGenerator');
const RelayCompilerContext = require('RelayCompilerContext');
const RelayConnectionTransform = require('RelayConnectionTransform');
const RelayExportTransform = require('RelayExportTransform');
const RelayFieldHandleTransform = require('RelayFieldHandleTransform');
const RelayFilterDirectivesTransform = require('RelayFilterDirectivesTransform');
const RelayFlattenTransform = require('RelayFlattenTransform');
const RelayGenerateRequisiteFieldsTransform =
  require('RelayGenerateRequisiteFieldsTransform');
const RelayKnownFragmentSpreadValidator = require('RelayKnownFragmentSpreadValidator');
const RelayPrinter = require('RelayPrinter');
const RelayRelayDirectiveTransform = require('RelayRelayDirectiveTransform');
const RelaySkipClientFieldTransform = require('RelaySkipClientFieldTransform');
const RelaySkipHandleFieldTransform = require('RelaySkipHandleFieldTransform');
const RelaySkipRedundantNodesTransform =
  require('RelaySkipRedundantNodesTransform');
const RelaySkipUnreachableNodeTransform =
  require('RelaySkipUnreachableNodeTransform');
const RelayStripRootAliasTransform = require('RelayStripRootAliasTransform');
const RelayViewerHandleTransform = require('RelayViewerHandleTransform');

const filterContextForNode = require('filterContextForNode');
const invariant = require('invariant');

import type {GeneratedNode} from 'RelayConcreteNode';
import type {Fragment, Root} from 'RelayIR';
import type {GraphQLSchema} from 'graphql';

export type CompiledDocumentMap = Map<string, GeneratedNode>;
export type TransformReducer = (
  ctx: RelayCompilerContext,
  transform: (ctx: RelayCompilerContext) => RelayCompilerContext
) => RelayCompilerContext;

export interface Compiler {
  add(text: string): Array<Root | Fragment>,
  compile(): CompiledDocumentMap,
}

// Transforms applied to fragments used for reading data from a store
const FRAGMENT_TRANSFORMS = [
  RelayConnectionTransform.transform,
  RelayViewerHandleTransform.transform,
  RelayRelayDirectiveTransform.transform,
  RelayFieldHandleTransform.transform,
  ctx => RelayFlattenTransform.transform(ctx, {
    flattenAbstractTypes: true,
  }),
  RelaySkipRedundantNodesTransform.transform,
];

// Transforms applied to queries/mutations/subscriptions that are used for
// fetching data from the server and parsing those responses.
const QUERY_TRANSFORMS = [
  ctx => RelayConnectionTransform.transform(ctx, {
    generateRequisiteFields: true,
  }),
  RelayViewerHandleTransform.transform,
  RelayApplyFragmentArgumentTransform.transform,
  RelaySkipClientFieldTransform.transform,
  RelaySkipUnreachableNodeTransform.transform,
  RelayExportTransform.transform,
  RelayRelayDirectiveTransform.transform,
  RelayStripRootAliasTransform.transform, // for legacy GraphQL compatibility
  RelayGenerateRequisiteFieldsTransform.transform,
  RelayFilterDirectivesTransform.transform,
];

// Transforms applied to the code used to process a query response.
const CODEGEN_TRANSFORMS = [
  ctx => RelayFlattenTransform.transform(ctx, {
    flattenAbstractTypes: true,
    flattenFragmentSpreads: true,
  }),
  RelaySkipRedundantNodesTransform.transform,
];

// Transforms applied before printing the query sent to the server.
const PRINT_TRANSFORMS = [
  ctx => RelayFlattenTransform.transform(ctx, {}),
  RelaySkipHandleFieldTransform.transform,
];

// Schema extensions (primarily to add handling for custom directives)
const SCHEMA_TRANSFORMS = [
  RelayConnectionTransform.transformSchema,
  RelayExportTransform.transformSchema,
  RelayRelayDirectiveTransform.transformSchema,
];

// IR-level validators
const VALIDATORS = [
  RelayKnownFragmentSpreadValidator.validate,
];

/**
 * A utility class for parsing a corpus of GraphQL documents, transforming them
 * with a standardized set of transforms, and generating runtime representations
 * of each definition.
 */
class RelayCompiler {
  _context: RelayCompilerContext;
  _schema: GraphQLSchema;

  constructor(schema: GraphQLSchema, context?: RelayCompilerContext) {
    if (context) {
      this._context = context;
    } else {
      const extendedSchema = SCHEMA_TRANSFORMS.reduce(
        (acc, transform) => transform(acc),
        schema
      );
      this._context = new RelayCompilerContext(extendedSchema);
    }
    this._schema = schema;
  }

  clone(): RelayCompiler {
    return new RelayCompiler(this._schema, this._context);
  }

  add(text: string): Array<Root | Fragment> {
    const {context, nodes} = this._context.parse(text);
    this._context = context;
    return nodes;
  }

  transformedQueryContext(): RelayCompilerContext {
    return QUERY_TRANSFORMS.reduce(
      (ctx, transform) => transform(ctx, this._schema),
      this._context,
    );
  }

  compile(): CompiledDocumentMap {
    const transformContext =
      ((ctx, transform) => transform(ctx, this._schema): any);
    const fragmentContext = FRAGMENT_TRANSFORMS.reduce(transformContext, this._context);
    const queryContext = this.transformedQueryContext();
    const printContext = PRINT_TRANSFORMS.reduce(transformContext, queryContext);
    const codeGenContext = CODEGEN_TRANSFORMS.reduce(transformContext, queryContext);

    const validationErrors: Array<string> = [];
    VALIDATORS.forEach(validate => {
      const errors = validate(this._context);
      validationErrors.push(...errors);
    });
    invariant(
      !validationErrors.length,
      'RelayCompiler: Encountered validation errors:\n%s',
      validationErrors.map(msg => `* ${msg}`).join('\n'),
    );

    const compiledDocuments = new Map();
    fragmentContext.documents().forEach(node => {
      if (node.kind !== 'Fragment') {
        return;
      }
      const generatedFragment = RelayCodeGenerator.generate(node);
      compiledDocuments.set(node.name, generatedFragment);
    });
    queryContext.documents().forEach(node => {
      if (node.kind !== 'Root') {
        return;
      }
      const {name} = node;
      // The unflattened query is used for printing, since flattening creates an
      // invalid query.
      const text = filterContextForNode(printContext.getRoot(name), printContext)
        .documents()
        .map(RelayPrinter.print)
        .join('\n');
      // The original query (with fragment spreads) is converted to a fragment
      // for reading out the root data.
      const sourceNode = fragmentContext.getRoot(name);
      const rootFragment = buildFragmentForRoot(sourceNode);
      const generatedFragment = RelayCodeGenerator.generate(rootFragment);
      // The flattened query is used for codegen in order to reduce the number of
      // duplicate fields that must be processed during response normalization.
      const codeGenNode = codeGenContext.getRoot(name);
      const generatedQuery = RelayCodeGenerator.generate(codeGenNode);

      const batchQuery = {
        fragment: generatedFragment,
        id: null,
        kind: 'Batch',
        metadata: node.metadata || {},
        name,
        query: generatedQuery,
        text,
      };
      compiledDocuments.set(name, batchQuery);
    });
    return compiledDocuments;
  }
}

/**
 * Construct the fragment equivalent of a root node.
 */
function buildFragmentForRoot(root: Root): Fragment {
  return {
    argumentDefinitions: (root.argumentDefinitions: $FlowIssue),
    directives: root.directives,
    kind: 'Fragment',
    metadata: null,
    name: root.name,
    selections: root.selections,
    type: root.type,
  };
}

module.exports = RelayCompiler;
