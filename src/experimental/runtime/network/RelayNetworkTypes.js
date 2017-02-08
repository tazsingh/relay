/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayNetworkTypes
 * @flow
 */

'use strict';

import type {ConcreteBatch} from 'RelayConcreteNode';
import type {
  Disposable,
  HandleFieldPayload,
  MutableRecordSource,
  Observer,
} from 'RelayStoreTypes';
import type {Variables} from 'RelayTypes';

/**
 * Settings for how a query response may be cached.
 *
 * - `force`: causes a query to be issued unconditionally, irrespective of the
 *   state of any configured response cache.
 */
export type CacheConfig = {
  force: boolean,
};

/**
 * A cache for saving respones to queries (by id) and variables.
 */
export interface ResponseCache {
  get(id: string, variables: Variables): ?QueryPayload,
  set(id: string, variables: Variables, payload: QueryPayload): void,
}

/**
 * An interface for fetching the data for one or more (possibly interdependent)
 * queries.
 */
export interface Network {
  fetch: FetchFunction,
  request: RequestResponseFunction,
  requestSubscription: RequestSubscriptionFunction,
}

export type PayloadData = {[key: string]: mixed};

export type PayloadError = {
  message: string,
  locations?: Array<{
    line: number,
    column: number,
  }>,
};

/**
 * The shape of a GraphQL response as dictated by the
 * [spec](https://github.com/facebook/graphql/blob/master/spec/Section%207%20--%20Response.md)
 */
export type QueryPayload = {
  data: PayloadData,
} | {
  data: ?PayloadData,
  errors: Array<PayloadError>,
};

/**
 * The shape of data that is returned by the Relay network layer for a given
 * query.
 */
export type RelayResponsePayload = {
  fieldPayloads?: ?Array<HandleFieldPayload>,
  source: MutableRecordSource,
};

/**
 * A function that executes a GraphQL operation with request/response semantics,
 * with exactly one raw server response returned
 */
export type FetchFunction = (
  operation: ConcreteBatch,
  variables: Variables,
  cacheConfig: ?CacheConfig,
) => Promise<QueryPayload>;

/**
 * A function that executes a GraphQL operation with request/subscription
 * semantics, returning one or more responses over time that include the
 * initial result and optional updates e.g. as the results of the operation
 * change.
 */
export type RequestSubscriptionFunction = (
  operation: ConcreteBatch,
  variables: Variables,
  cacheConfig: ?CacheConfig,
  observer: Observer<RelayResponsePayload>,
) => Disposable;

/**
 * A function that executes a GraphQL operation with request/response semantics,
 * with exactly one response returned.
 */
export type RequestResponseFunction = (
  operation: ConcreteBatch,
  variables: Variables,
  cacheConfig?: ?CacheConfig,
) => Promise<RelayResponsePayload>;
