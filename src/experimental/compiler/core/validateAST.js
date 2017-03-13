/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 *
 * @providesModule validateAST
 * @flow
 */

'use strict';

const RelayValidator = require('RelayValidator');

const invariant = require('invariant');

import type {DocumentNode, GraphQLSchema} from 'graphql';

// Throws an error when the ast cannot be validated
function validateAST(
  ast: DocumentNode,
  schema: GraphQLSchema,
  validationRules: Array<Function>,
): void {
  try {
    RelayValidator.validate(ast, schema, validationRules);
  } catch (e) {
    const errorMessages = [];
    const text = ast.loc && ast.loc.source.body;
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
}

module.exports = validateAST;
