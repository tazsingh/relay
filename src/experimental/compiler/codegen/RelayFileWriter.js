/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 *
 * @providesModule RelayFileWriter
 * @flow
 */

'use strict';

const ASTConvert = require('ASTConvert');
const CodegenDirectory = require('CodegenDirectory');
const RelayCompiler = require('RelayCompiler');
const RelayCompilerContext = require('RelayCompilerContext');
const RelayValidator = require('RelayValidator');

const writeFlowFile = require('./writeFlowFile');
const writeRelayQLFile = require('./writeRelayQLFile');

const {Map: ImmutableMap} = require('immutable');

import type {GeneratedNode} from 'RelayConcreteNode';
import type {DocumentNode, GraphQLSchema} from 'graphql';

type GenerateExtraFiles = (
  getOutputDirectory: (path?: string) => CodegenDirectory,
  compilerContext: RelayCompilerContext,
) => void;

export type WriterConfig = {
  outputDir: string,
  generateExtraFiles?: GenerateExtraFiles,
  persistQuery?: (text: string) => Promise<string>,
  platform?: string,
};

/* eslint-disable no-console-disallow */

class RelayFileWriter {
  _outputDir: string;
  _onlyValidate: boolean
  _generateExtraFiles: ?GenerateExtraFiles;
  _baseSchema: GraphQLSchema;
  _baseDocuments: ImmutableMap<string, DocumentNode>;
  _documents: ImmutableMap<string, DocumentNode>;
  _persistQuery: ?((text: string) => Promise<string>);
  _platform: ?string;


  constructor(options: {
    config: WriterConfig,
    onlyValidate: boolean,
    baseDocuments: ImmutableMap<string, DocumentNode>,
    documents: ImmutableMap<string, DocumentNode>,
    schema: GraphQLSchema,
  }) {
    const {config, onlyValidate, baseDocuments, documents, schema} = options;
    this._onlyValidate = onlyValidate;
    this._outputDir = config.outputDir;
    this._baseSchema = schema;
    this._generateExtraFiles = config.generateExtraFiles || null;
    this._persistQuery = config.persistQuery || null;
    this._platform = config.platform || null;
    this._baseDocuments = baseDocuments || ImmutableMap();
    this._documents = documents;
  }

  async writeAll(): Promise<Map<string, CodegenDirectory>> {
    const tStart = Date.now();

    const allDocuments = this._baseDocuments.merge(this._documents);

    // Can't convert to IR unless the schema already has Relay-local extensions
    const transformedSchema = ASTConvert.transformASTSchema(this._baseSchema);
    const extendedSchema = ASTConvert.extendASTSchema(
      transformedSchema,
      allDocuments.valueSeq().toArray(),
    );

    // Build a context from all the documents
    const baseDefinitions = ASTConvert.convertASTDocuments(
      extendedSchema,
      this._baseDocuments.valueSeq().toArray(),
      RelayValidator.LOCAL_RULES,
    );
    const definitions = ASTConvert.convertASTDocuments(
      extendedSchema,
      this._documents.valueSeq().toArray(),
      RelayValidator.LOCAL_RULES,
    );
    const baseDefinitionNames = new Set(baseDefinitions.map(definition => definition.name));

    let compilerContext = new RelayCompilerContext(extendedSchema);
    compilerContext = compilerContext.addAll(baseDefinitions);
    const compiler = new RelayCompiler(this._baseSchema, compilerContext);

    const outputDirectory = new CodegenDirectory(
      this._outputDir,
      {onlyValidate: this._onlyValidate},
    );
    const allOutputDirectories: Map<string, CodegenDirectory> = new Map();
    allOutputDirectories.set(this._outputDir, outputDirectory);

    const nodes = compiler.addDefinitions(definitions);

    const transformedQueryContext = compiler.transformedQueryContext();
    const compiledDocumentMap = compiler.compile();

    const tCompiled = Date.now();

    const onlyValidate = this._onlyValidate;
    function getOutputDirectory(dir?: string): CodegenDirectory {
      if (!dir) {
        return outputDirectory;
      }
      let outputDir = allOutputDirectories.get(dir);
      if (!outputDir) {
        outputDir = new CodegenDirectory(dir, {onlyValidate});
        allOutputDirectories.set(dir, outputDir);
      }
      return outputDir;
    }

    const compiledDocuments: Array<GeneratedNode> = [];
    nodes.forEach(node => {
      if (baseDefinitionNames.has(node.name)) {
        // don't add definitions that were part of base context
        return;
      }
      if (node.kind === 'Fragment') {
        writeFlowFile(outputDirectory, node, this._platform || undefined);
      }
      const compiledNode = compiledDocumentMap.get(node.name);
      if (compiledNode) {
        compiledDocuments.push(compiledNode);
      }
    });

    const tFlow = Date.now();

    let tRelayQL;
    try {
      await Promise.all(compiledDocuments.map(async (generatedNode) => {
        await writeRelayQLFile(
          outputDirectory,
          generatedNode,
          this.skipPersist ? null : this._persistQuery,
          this._platform || null,
        );
      }));
      tRelayQL = Date.now();

      if (this._generateExtraFiles) {
        this._generateExtraFiles(getOutputDirectory, transformedQueryContext);
      }

      outputDirectory.deleteExtraFiles();
    } catch (error) {
      tRelayQL = Date.now();
      let details;
      try {
        details = JSON.parse(error.message);
      } catch (_) {
      }
      if (details && details.name === 'GraphQL2Exception' && details.message) {
        console.log('ERROR writing modules:\n' + details.message);
      } else {
        console.log('Error writing modules:\n' + error.toString());
      }
      return allOutputDirectories;
    }

    const tExtra = Date.now();
    console.log(
      'Writer time: %s [%s compiling, %s relay files, %s flow types, %s extra]',
      toSeconds(tStart, tExtra),
      toSeconds(tStart, tCompiled),
      toSeconds(tCompiled, tFlow),
      toSeconds(tFlow, tRelayQL),
      toSeconds(tRelayQL, tExtra),
    );
    return allOutputDirectories;
  }
}

function toSeconds(t0, t1) {
  return ((t1 - t0) / 1000).toFixed(2) + 's';
}

module.exports = RelayFileWriter;
