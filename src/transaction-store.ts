import { TransactionTemplate } from './transaction.js';
import { readFile, writeFile } from 'fs/promises';

export interface TransactionStore {
  setTransaction(template: TransactionTemplate): Promise<void>;
  getTransaction(): Promise<TransactionTemplate>;
}

export class LocalTransactionStore implements TransactionStore {
  tx: TransactionTemplate | undefined;

  setTransaction(template: TransactionTemplate): Promise<void> {
    this.tx = template;
    return Promise.resolve();
  }
  getTransaction(): Promise<TransactionTemplate> {
    if (this.tx === undefined) {
      return Promise.reject(new Error('transaction template is undefined'));
    } else {
      return Promise.resolve(this.tx);
    }
  }
}

export class FileTransactionStore implements TransactionStore {
  file: string;
  constructor(file: string) {
    this.file = file;
  }
  async setTransaction(template: TransactionTemplate): Promise<void> {
    await writeFile(this.file, template.toJSON());
  }
  async getTransaction(): Promise<TransactionTemplate> {
    return TransactionTemplate.fromJSON((await readFile(this.file)).toString());
  }
}
