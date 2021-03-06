---
id: babel-plugin-relay
title: babel-plugin-relay
layout: docs
category: Relay Modern
permalink: docs/babel-plugin-relay.html
next: relay-compiler
---

Relay uses a **Babel** plugin to convert `graphql` literals into requires of
the code generated by Relay Compiler.

While you type queries as:

```javascript
graphql`
  fragment MyComponent on Type {
    field
  }
`
```

This gets converted into a "lazy" require of a generated file:

```javascript
function () {
  return require('./__generated__/MyComponent.graphql');
}
```


### Setting up babel-plugin-relay

First, install the plugin (typically as a `devDependency`):

```sh
yarn add --dev babel-plugin-relay@dev
```

Then, add `"relay"` to the list of plugins in your .babelrc file. For example:

```javascript
{
  "plugins": [
    "relay"
  ]
}
```

Please note that the `"relay"` plugin should run before other plugins or
presets to ensure the `graphql` template literals are correctly transformed. See
Babel's [documentation on this topic](https://babeljs.io/docs/plugins/#plugin-preset-ordering).


### Using with Relay Classic

With some additional configuration, the `"relay"` babel plugin can also translate
Relay Classic `Relay.QL` literals. Most importantly, include a reference to your GraphQL Schema as either a json file or graphql schema file.

```javascript
{
  "plugins": [
    ["relay", {"schema": "path/schema.graphql"}]
  ]
}
```

Please note that this replaces the [older Babel Relay plugin](./guides-babel-plugin.html). It is not necessary to include both plugins.


### Using during conversion in "compatibility mode"

When incrementally converting a Relay Classic app to Relay Modern, `graphql`
literals can be translated to be usable by *both* runtimes if configured to use
compatibility mode:

```javascript
{
  "plugins": [
    ["relay", {"compat": true, "schema": "path/schema.graphql"}]
  ]
}
```


### Additional Options

The Relay Classic and Relay Compat modes produce generated content inline and may
catch and log any detected GraphQL validation errors, leaving those errors to be
thrown at runtime.

When compiling code for production deployment, the plugin can be configured to immediately throw upon encountering a validation problem. The plugin can be further customized for different environments with the following options:

```javascript
{
  "plugins": [
    ["relay", {
      "compat": true,
      "schema": "path/schema.graphql",

      // Will throw an error when it validates the queries at build time.
      "enforceSchema": true,

      // Suppresses all warnings that would be printed.
      "suppressWarnings": false,

      // If `enforceSchema` is `false` and `debug` is `true`
      // then validation errors be logged at build time.
      "debug": false,
    }]
  ]
}
```
