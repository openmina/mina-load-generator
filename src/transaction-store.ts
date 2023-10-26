import { TransactionTemplate } from './transaction.js';
import { readFile, writeFile } from 'fs/promises';
import { RemoteService } from './remote-access.js';

export interface TransactionStore {
  setTransaction(template: TransactionTemplate): Promise<void>;
  getTransaction(): Promise<TransactionTemplate>;
}

export function transactionStore(file?: string, url?: string, id?: string) {
  if (file !== undefined) return new FileTransactionStore(file);
  if (url !== undefined) return new RemoteTransactionStore(url, id);
  return new LocalTransactionStore();
}

export class LocalTransactionStore implements TransactionStore {
  txs: TransactionTemplate[] = [];
  txIndex = 0;

  setTransaction(template: TransactionTemplate): Promise<void> {
    this.txs.push(template);
    return Promise.resolve();
  }
  getTransaction(): Promise<TransactionTemplate> {
    if (this.txs.length === 0) {
      return Promise.reject(new Error('transaction template is undefined'));
    } else {
      let i = this.txIndex;
      this.txIndex = (i + 1) % this.txs.length;
      return Promise.resolve(this.txs[i]);
    }
  }
}

export class FileTransactionStore implements TransactionStore {
  file: string;
  constructor(file: string) {
    this.file = file;
  }
  async setTransaction(template: TransactionTemplate): Promise<void> {
    await writeFile(this.file, JSON.stringify(template.toJSON()));
  }
  async getTransaction(): Promise<TransactionTemplate> {
    return TransactionTemplate.fromJSON(
      JSON.parse((await readFile(this.file)).toString())
    );
  }
}

export class RemoteTransactionStore
  extends RemoteService
  implements TransactionStore
{
  setTransaction(template: TransactionTemplate): Promise<void> {
    return this.post('/transaction', template.toJSON());
  }
  async getTransaction(): Promise<TransactionTemplate> {
    const res = await this.get<{ tx: any; signers: any[] }>('/transaction');
    return TransactionTemplate.fromJSON(res);
  }
}
