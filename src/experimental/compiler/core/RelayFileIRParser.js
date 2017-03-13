/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 *
 * @providesModule RelayFileIRParser
 * @flow
 */

'use strict';

const FileParser = require('FileParser');
const FindRelayQL = require('FindRelayQL');
const GraphQL = require('graphql');

const fs = require('fs');
const invariant = require('invariant');
const path = require('path');

import type {DocumentNode} from 'graphql';

// Throws an error if parsing the file fails
function parseFile(file: string): ?DocumentNode {
  const text = fs.readFileSync(file, 'utf8');
  const moduleName = path.basename(file, '.js');
  if (text.indexOf('graphql') < 0) {
    // This file doesn't contain any Relay definitions to parse
    return null;
  }

  const astDefinitions = [];
  FindRelayQL.memoizedFind(text, moduleName).forEach(({tag, template}) => {
    if (!(tag === 'graphql' || tag === 'graphql.experimental')) {
      throw new Error(
        'Invalid tag ' + tag + ' in module ' + moduleName + '. Expected `graphql` ' +
        ' (common case) or `graphql.experimental` (if using experimental ' +
        'directives).'
      );
    }
    if (
      tag !== 'graphql.experimental' &&
      /@argument(Definition)?s\b/.test(template)
    ) {
      throw new Error(
        'Unexpected use of fragment variables: @arguments and ' +
        '@argumentDefinitions are only supported in ' +
        'graphql.experimental literals. Source: ' + template
      );
    }
    const ast = GraphQL.parse(template);
    invariant(
      ast.definitions.length,
      'RelayFileIRParser: Expected GraphQL text to contain at least one ' +
      'definition (fragment, mutation, query, subscription), got `%s`.',
      template
    );

    astDefinitions.push(...ast.definitions);
  });

  return {
    kind: 'Document',
    definitions: astDefinitions,
  };
}

function parser(baseDir: string): FileParser {
  return new FileParser({
    baseDir,
    parse: parseFile,
  });
}

module.exports = {parser};
