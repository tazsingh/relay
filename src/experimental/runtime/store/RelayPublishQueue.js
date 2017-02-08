/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @providesModule RelayPublishQueue
 */

'use strict';

const RelayInMemoryRecordSource = require('RelayInMemoryRecordSource');
const RelayRecordSourceMutator = require('RelayRecordSourceMutator');
const RelayRecordSourceProxy = require('RelayRecordSourceProxy');
const RelayRecordSourceSelectorProxy = require('RelayRecordSourceSelectorProxy');

const invariant = require('invariant');

import type {RelayResponsePayload} from 'RelayNetworkTypes';
import type {HandlerProvider} from 'RelayStaticEnvironment';
import type {
  HandleFieldPayload,
  MutableRecordSource,
  Selector,
  SelectorStoreUpdater,
  Store,
  StoreUpdater,
} from 'RelayStoreTypes';

type Payload = {
  fieldPayloads: ?Array<HandleFieldPayload>,
  selector: Selector,
  source: MutableRecordSource,
  updater: ?SelectorStoreUpdater,
};

/**
 * Coordinates the concurrent modification of a `Store` due to optimistic and
 * server updates:
 * - Applies optimistic updates.
 * - Reverts optimistic updates, rebasing any subsequent updates.
 * - Commits server updates:
 *   - Normalizes query/mutation/subscription responses.
 *   - Executes handlers for "handle" fields.
 *   - Reverts and reapplies pending optimistic updates.
 */
class RelayPublishQueue {
  _store: Store;
  _handlerProvider: ?HandlerProvider;

  // A "negative" of all applied updaters. It can be published to the store to
  // undo them in order to re-apply some of them for a rebase.
  _backup: MutableRecordSource;
  // True if the next `run()` should apply the backup and rerun all updates
  // performing a rebase.
  _pendingBackupRebase: boolean;
  // Payloads to apply with the next `run()`.
  _pendingPayloads: Set<Payload>;
  // Updaters to add with the next `run()`
  _pendingUpdaters: Set<StoreUpdater>;
  // Updaters that are already added and might be rerun in order to rebase them.
  _appliedUpdaters: Set<StoreUpdater>;

  constructor(
    store: Store,
    handlerProvider?: ?HandlerProvider
  ) {
    this._backup = new RelayInMemoryRecordSource();
    this._handlerProvider = handlerProvider || null;
    this._pendingBackupRebase = false;
    this._pendingPayloads = new Set();
    this._pendingUpdaters = new Set();
    this._store = store;
    this._appliedUpdaters = new Set();
  }

  /**
   * Schedule applying an optimistic updates on the next `run()`.
   */
  applyUpdate(updater: StoreUpdater): void {
    invariant(
      !this._appliedUpdaters.has(updater) &&
      !this._pendingUpdaters.has(updater),
      'RelayPublishQueue: Cannot apply the same update function more than ' +
      'once concurrently.'
    );
    this._pendingUpdaters.add(updater);
  }

  /**
   * Schedule reverting an optimistic updates on the next `run()`.
   */
  revertUpdate(updater: StoreUpdater): void {
    if (this._pendingUpdaters.has(updater)) {
      // Reverted before it was applied
      this._pendingUpdaters.delete(updater);
    } else if (this._appliedUpdaters.has(updater)) {
      this._pendingBackupRebase = true;
      this._appliedUpdaters.delete(updater);
    }
  }

  /**
   * Schedule a revert of all optimistic updates on the next `run()`.
   */
  revertAll(): void {
    this._pendingBackupRebase = true;
    this._pendingUpdaters.clear();
    this._appliedUpdaters.clear();
  }

  /**
   * Schedule applying a payload to the store on the next `run()`.
   */
  commitPayload(
    selector: Selector,
    {fieldPayloads, source}: RelayResponsePayload,
    updater?: ?SelectorStoreUpdater,
  ): void {
    this._pendingBackupRebase = true;
    this._pendingPayloads.add({fieldPayloads, selector, source, updater});
  }

  /**
   * Execute all queued up operations from the other public methods.
   */
  run(): void {
    if (this._pendingBackupRebase && this._backup.size()) {
      this._store.publish(this._backup);
      this._backup = new RelayInMemoryRecordSource();
    }
    this._commitPayloads();
    this._applyUpdates();
    this._pendingBackupRebase = false;
    this._store.notify();
  }

  _commitPayloads(): void {
    if (!this._pendingPayloads.size) {
      return;
    }
    this._pendingPayloads.forEach(({fieldPayloads, selector, source, updater}) => {
      const mutator = new RelayRecordSourceMutator(
        this._store.getSource(),
        source
      );
      const proxy = new RelayRecordSourceSelectorProxy(mutator, selector);
      if (fieldPayloads && fieldPayloads.length) {
        fieldPayloads.forEach(fieldPayload => {
          const handler =
            this._handlerProvider && this._handlerProvider(fieldPayload.handle);
          invariant(
            handler,
            'RelayStaticEnvironment: Expected a handler to be provided for handle `%s`.',
            fieldPayload.handle
          );
          handler.update(proxy, fieldPayload);
        });
      }
      if (updater) {
        updater(proxy);
      }
      // Publish the server data first so that it is reflected in the mutation
      // backup created during the rebase
      this._store.publish(source);
    });
    this._pendingPayloads.clear();
  }

  _applyUpdates(): void {
    if (
      this._pendingUpdaters.size ||
      (this._pendingBackupRebase && this._appliedUpdaters.size)
    ) {
      const sink = new RelayInMemoryRecordSource();
      const mutator = new RelayRecordSourceMutator(
        this._store.getSource(),
        sink,
        this._backup,
      );
      const proxy = new RelayRecordSourceProxy(mutator);

      // rerun all updaters in case we are running a rebase
      if (this._pendingBackupRebase && this._appliedUpdaters.size) {
        this._appliedUpdaters.forEach(updater => updater(proxy));
      }

      // apply any new updaters
      if (this._pendingUpdaters.size) {
        this._pendingUpdaters.forEach(updater => {
          updater(proxy);
          this._appliedUpdaters.add(updater);
        });
        this._pendingUpdaters.clear();
      }

      this._store.publish(sink);
    }
  }
}

module.exports = RelayPublishQueue;
