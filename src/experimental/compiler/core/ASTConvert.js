/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 *
 * @providesModule ASTConvert
 * @flow
 */

'use strict';

const RelayParser = require('RelayParser');
const RelayValidator = require('RelayValidator');

const {SCHEMA_TRANSFORMS} = require('RelayIRTransforms');
const {
  isSchemaDefinitionAST,
  isOperationDefinitionAST,
} = require('RelaySchemaUtils');
const {extendSchema} = require('graphql');

import type {Fragment, Root} from 'RelayIR';
import type {
  DefinitionNode,
  DocumentNode,
  FragmentDefinitionNode,
  GraphQLSchema,
  OperationDefinitionNode,
} from 'graphql';

function convertASTDocuments(
  schema: GraphQLSchema,
  documents: Array<DocumentNode>,
  validationRules: Array<Function>,
): Array<Fragment | Root> {
  // should be Array<FragmentDefinitionNode | OperationDefinitionNode>
  // Graphql's AST types have a flow problem where
  // FragmentDefinitionNode | OperationDefinitionNode is not useable as a DefinitionNode
  const astDefinitions: Array<DefinitionNode> = [];
  documents.forEach(doc => {
    doc.definitions.forEach(definition => {
      if (isOperationDefinitionAST(definition)) {
        // TODO: isOperationDefinitionAST should %checks, once %checks is available
        astDefinitions.push(definition);
      }
    });
  });

  const validationAST = {
    kind: 'Document',
    definitions: astDefinitions,
  };
  // Will throw an error if there are validation issues
  RelayValidator.validate(validationAST, schema, validationRules);
  const operationDefinitions: Array<OperationDefinitionNode | FragmentDefinitionNode> =
    (astDefinitions: Array<any>);

  return operationDefinitions.map(
    definition => RelayParser.transform(schema, definition),
  );
}

function transformASTSchema(
  baseSchema: GraphQLSchema
): GraphQLSchema {
  return SCHEMA_TRANSFORMS.reduce(
    (acc, transform) => transform(acc),
    baseSchema,
  );
}

function extendASTSchema(
  baseSchema: GraphQLSchema,
  documents: Array<DocumentNode>,
): GraphQLSchema {
  // Should be TypeSystemDefinitionNode
  const schemaExtensions: Array<DefinitionNode> = [];
  documents.forEach(doc => {
    // TODO: isSchemaDefinitionAST should %checks, once %checks is available
    schemaExtensions.push(...doc.definitions.filter(isSchemaDefinitionAST));
  });

  if (schemaExtensions.length <= 0) {
    return baseSchema;
  }

  // Flow doesn't recognize that TypeSystemDefinitionNode is a subset of DefinitionNode
  const definitions: Array<DefinitionNode> = (schemaExtensions: Array<any>);
  return extendSchema(baseSchema, {
    kind: 'Document',
    definitions,
  });
}

module.exports = {
  convertASTDocuments,
  extendASTSchema,
  transformASTSchema,
};
