import { TransactionTemplate } from './transaction.js';
import { readFile, writeFile } from 'fs/promises';
import { RemoteService } from './remote-access.js';
import { PublicKey } from 'o1js';

export interface TransactionStore {
  setTransaction(template: TransactionTemplate): Promise<void>;
  getTransaction(sender: PublicKey | undefined): Promise<TransactionTemplate>;
}

export function transactionStore(file?: string, url?: string, id?: string) {
  if (file !== undefined) return new FileTransactionStore(file);
  if (url !== undefined) return new RemoteTransactionStore(url, id);
  return new LocalTransactionStore();
}

export class LocalTransactionStore implements TransactionStore {
  txs: Map<string, TransactionTemplate> = new Map();

  setTransaction(template: TransactionTemplate): Promise<void> {
    const key = template.tx.feePayer.body.publicKey;
    this.txs.set(key, template);
    return Promise.resolve();
  }
  getTransaction(sender?: PublicKey): Promise<TransactionTemplate> {
    let template;
    if (sender !== undefined) {
      template = this.txs.get(sender.toBase58());
    } else {
      template = this.txs.values().next().value;
    }
    if (template === undefined) {
      return Promise.reject(new Error('transaction template is undefined'));
    } else {
      return Promise.resolve(template);
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
