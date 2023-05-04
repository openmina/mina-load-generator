import { TransactionId } from 'snarkyjs/dist/node/lib/mina.js';

export interface TransactionIdsStore {
  addTransactionId(id: TransactionId): Promise<void>;
  getTransactionIds(): Promise<TransactionId[]>;
}

export class LocalTransactionIdsStore implements TransactionIdsStore {
  ids: TransactionId[] = [];

  addTransactionId(id: TransactionId): Promise<void> {
    this.ids.push(id);
    return Promise.resolve();
  }
  getTransactionIds(): Promise<TransactionId[]> {
    return Promise.resolve([...this.ids]);
  }
}

export class FileTransactionIdsStore implements TransactionIdsStore {
  file: string;
  constructor(file: string) {
    this.file = file;
  }
  addTransactionId(_id: TransactionId): Promise<void> {
    throw new Error('Method not implemented.');
  }
  getTransactionIds(): Promise<TransactionId[]> {
    throw new Error('Method not implemented.');
  }
}
