import { registerCollectionAndFetchMethods } from './methods/collection-fetch-methods.js';
import { registerTransactionWriteMethods } from './methods/transaction-write-methods.js';
import { registerGoalsMethods } from './methods/goals-methods.js';
import { registerMetricsMethods } from './methods/metrics-methods.js';

export class TransactionRepository {
  constructor(db, appId) {
    this.db = db;
    this.appId = appId;
  }
}

registerCollectionAndFetchMethods(TransactionRepository);
registerTransactionWriteMethods(TransactionRepository);
registerGoalsMethods(TransactionRepository);
registerMetricsMethods(TransactionRepository);
