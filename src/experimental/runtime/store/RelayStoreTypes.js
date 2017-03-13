/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayStoreTypes
 * @flow
 */

'use strict';

import type {
  CacheConfig,
  CFragmentMap,
  COperationSelector,
  CRelayContext,
  CSelector,
  CUnstableEnvironmentCore,
  Disposable,
  SelectorData,
} from 'RelayCombinedEnvironmentTypes';
import type {ConcreteBatch, ConcreteFragment, ConcreteSelectableNode} from 'RelayConcreteNode';
import type {DataID} from 'RelayInternalTypes';
import type {RelayResponsePayload} from 'RelayNetworkTypes';
import type {RecordState} from 'RelayRecordState';
import type {GraphQLTaggedNode} from 'RelayStaticGraphQLTag';
import type {Variables} from 'RelayTypes';

type TEnvironment = Environment;
type TFragment = ConcreteFragment;
type TGraphQLTaggedNode = GraphQLTaggedNode;
type TNode = ConcreteSelectableNode;
type TOperation = ConcreteBatch;

export type FragmentMap = CFragmentMap<TFragment>;
export type OperationSelector = COperationSelector<TNode, TOperation>;
export type RelayContext = CRelayContext<TEnvironment>;
export type Selector = CSelector<TNode>;
export interface UnstableEnvironmentCore extends CUnstableEnvironmentCore<
  TEnvironment,
  TFragment,
  TGraphQLTaggedNode,
  TNode,
  TOperation,
> {}

/**
 * A read-only interface for accessing cached graph data.
 */
export interface RecordSource {
  get(dataID: DataID): ?Record,
  getRecordIDs(): Array<DataID>,
  getStatus(dataID: DataID): RecordState,
  has(dataID: DataID): boolean,
  load(
    dataID: DataID,
    callback: (error: ?Error, record: ?Record) => void
  ): void,
  size(): number,
}

/**
 * A read/write interface for accessing and updating graph data.
 */
export interface MutableRecordSource extends RecordSource {
  clear(): void,
  delete(dataID: DataID): void,
  remove(dataID: DataID): void,
  set(dataID: DataID, record: Record): void,
}

/**
 * An interface for keeping multiple views of data consistent across an
 * application.
 */
export interface Store {
  /**
   * Get a read-only view of the store's internal RecordSource.
   */
  getSource(): RecordSource,

  /**
   * Read the results of a selector from in-memory records in the store.
   */
  lookup(selector: Selector): Snapshot,

  /**
   * Notify subscribers (see `subscribe`) of any data that was published
   * (`publish()`) since the last time `notify` was called.
   */
  notify(): void,

  /**
   * Publish new information (e.g. from the network) to the store, updating its
   * internal record source. Subscribers are not immediately notified - this
   * occurs when `notify()` is called.
   */
  publish(source: RecordSource): void,

  /**
   * Attempts to load all the records necessary to fulfill the selector into the
   * in-memory record source.
   */
  resolve(
    target: MutableRecordSource,
    selector: Selector,
    callback: AsyncLoadCallback
  ): void,

  /**
   * Ensure that all the records necessary to fulfill the given selector are
   * retained in-memory. The records will not be eligible for garbage collection
   * until the returned reference is disposed.
   */
  retain(selector: Selector): Disposable,

  /**
   * Subscribe to changes to the results of a selector. The callback is called
   * when `notify()` is called *and* records have been published that affect the
   * selector results relative to the last `notify()`.
   */
  subscribe(
    snapshot: Snapshot,
    callback: (snapshot: Snapshot) => void
  ): Disposable,
}

/**
 * An interface for imperatively getting/setting properties of a `Record`. This interface
 * is designed to allow the appearance of direct Record manipulation while
 * allowing different implementations that may e.g. create a changeset of
 * the modifications.
 */
export interface RecordProxy {
  copyFieldsFrom(source: RecordProxy): void,
  getDataID(): DataID,
  getLinkedRecord(name: string, args?: ?Variables): ?RecordProxy,
  getLinkedRecords(name: string, args?: ?Variables): ?Array<?RecordProxy>,
  getOrCreateLinkedRecord(name: string, typeName: string, args?: ?Variables): RecordProxy,
  getType(): string,
  getValue(name: string, args?: ?Variables): mixed,
  setLinkedRecord(record: RecordProxy, name: string, args?: ?Variables): RecordProxy,
  setLinkedRecords(records: Array<?RecordProxy>, name: string, args?: ?Variables): RecordProxy,
  setValue(value: mixed, name: string, args?: ?Variables): RecordProxy,
}

/**
 * An interface for imperatively getting/setting properties of a `RecordSource`. This interface
 * is designed to allow the appearance of direct RecordSource manipulation while
 * allowing different implementations that may e.g. create a changeset of
 * the modifications.
 */
export interface RecordSourceProxy {
  create(dataID: DataID, typeName: string): RecordProxy,
  delete(dataID: DataID): void,
  get(dataID: DataID): ?RecordProxy,
  getRoot(): RecordProxy,
}

/**
 * Extends the RecordSourceProxy interface with methods for accessing the root
 * fields of a Selector.
 */
export interface RecordSourceSelectorProxy {
  create(dataID: DataID, typeName: string): RecordProxy,
  delete(dataID: DataID): void,
  get(dataID: DataID): ?RecordProxy,
  getRoot(): RecordProxy,
  getRootField(fieldName: string): ?RecordProxy,
  getPluralRootField(fieldName: string): ?Array<?RecordProxy>,
}

/**
 * The public API of Relay core. Represents an encapsulated environment with its
 * own in-memory cache.
 */
export interface Environment {
  /**
   * Apply an optimistic update to the environment. The mutation can be reverted
   * by calling `dispose()` on the returned value.
   */
  applyUpdate(
    updater: StoreUpdater
  ): Disposable,

  /**
   * Read the results of a selector from in-memory records in the store.
   */
  lookup(
    selector: Selector,
  ): Snapshot,

  /**
   * Subscribe to changes to the results of a selector. The callback is called
   * when data has been committed to the store that would cause the results of
   * the snapshot's selector to change.
   */
  subscribe(
    snapshot: Snapshot,
    callback: (snapshot: Snapshot) => void,
  ): Disposable,

  /**
   * Ensure that all the records necessary to fulfill the given selector are
   * retained in-memory. The records will not be eligible for garbage collection
   * until the returned reference is disposed.
   *
   * Note: This is a no-op in the legacy core.
   */
  retain(selector: Selector): Disposable,

  /**
   * Get the environment's internal Store.
   */
  getStore(): Store,

  /**
   * Send a query to the server with request/response semantics: the query will
   * either complete successfully (calling `onNext` and `onCompleted`) or fail
   * (calling `onError`).
   *
   * Note: Most applications should use `sendQuerySubscription` in order to
   * optionally receive updated information over time, should that feature be
   * supported by the network/server. A good rule of thumb is to use this method
   * if you would otherwise immediately dispose the `sendQuerySubscription()`
   * after receving the first `onNext` result.
   */
  sendQuery(config: {|
    cacheConfig?: ?CacheConfig,
    onCompleted?: ?() => void,
    onError?: ?(error: Error) => void,
    onNext?: ?(payload: RelayResponsePayload) => void,
    operation: OperationSelector,
  |}): Disposable,

  /**
   * Send a query to the server with request/subscription semantics: one or more
   * responses may be returned (via `onNext`) over time followed by either
   * the request completing (`onCompleted`) or an error (`onError`).
   *
   * Networks/servers that support subscriptions may choose to hold the
   * subscription open indefinitely such that `onCompleted` is not called.
   */
  sendQuerySubscription(config: {|
    cacheConfig?: ?CacheConfig,
    onCompleted?: ?() => void,
    onError?: ?(error: Error) => void,
    onNext?: ?(payload: RelayResponsePayload) => void,
    operation: OperationSelector,
  |}): Disposable,

  /**
   * Send a mutation to the server. If provided, the optimistic updater is
   * executed immediately and reverted atomically when the server payload is
   * committed.
   */
  sendMutation(config: {|
    onCompleted?: ?() => void,
    onError?: ?(error: Error) => void,
    operation: OperationSelector,
    optimisticUpdater?: ?StoreUpdater,
    updater?: ?SelectorStoreUpdater,
  |}): Disposable,

  unstable_internal: UnstableEnvironmentCore,
}

export type Observer<T> = {
  onCompleted?: ?() => void,
  onError?: ?(error: Error) => void,
  onNext?: ?(data: T) => void,
};

/**
 * A representation of a selector and its results at a particular point in time.
 */
export type Snapshot = Selector & {
  data: ?SelectorData,
  seenRecords: RecordMap,
};

/**
 * The results of reading data for a fragment. This is similar to a `Selector`,
 * but references the (fragment) node by name rather than by value.
 */
export type FragmentPointer = {
  __id: DataID,
  __fragments: {[fragmentName: string]: Variables},
};

/*
 * An individual cached graph object.
 */
export type Record = {[key: string]: mixed};

/**
 * A collection of records keyed by id.
 */
export type RecordMap = {[dataID: DataID]: ?Record};

/**
 * A callback for resolving a Selector from a source.
 */
export type AsyncLoadCallback = (loadingState: LoadingState) => void;
export type LoadingState = $Exact<{
  status: 'aborted' | 'complete' | 'error' | 'missing',
  error?: Error,
}>;

/**
 * A map of records affected by an update operation.
 */
export type UpdatedRecords = {[dataID: DataID]: boolean};

/**
 * A function that updates a store (via a proxy) given the results of a "handle"
 * field payload.
 */
export type Handler = {
  update: (
    proxy: RecordSourceProxy,
    fieldPayload: HandleFieldPayload,
  ) => void,
};

/**
 * A payload that is used to initialize or update a "handle" field with
 * information from the server.
 */
export type HandleFieldPayload = $Exact<{
  // The arguments that were fetched.
  args: Variables,
  // The __id of the record containing the source/handle field.
  dataID: DataID,
  // The (storage) key at which the original server data was written.
  fieldKey: string,
  // The name of the handle.
  handle: string,
  // The (storage) key at which the handle's data should be written by the
  // handler.
  handleKey: string,
}>;

/**
 * A function that receives a proxy over the store and may trigger side-effects
 * (indirectly) by calling `set*` methods on the store or its record proxies.
 */
export type StoreUpdater = (proxy: RecordSourceProxy) => void;

/**
 * Similar to StoreUpdater, but accepts a proxy tied to a specific selector in
 * order to easily access the root fields of a query/mutation.
 */
export type SelectorStoreUpdater = (proxy: RecordSourceSelectorProxy) => void;
