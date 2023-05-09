import { readFile, writeFile } from 'fs/promises';
import { fetchTransactionStatus } from 'snarkyjs';
import { TransactionId } from 'snarkyjs/dist/node/lib/mina.js';
import { RemoteService } from './remote-access.js';

export interface TransactionIdsStore {
  addTransactionId(id: TransactionId): Promise<void>;
  getTransactionIds(): Promise<TransactionId[]>;
}

export async function transactionIdsStore(
  file?: string,
  url?: string,
  id?: string
) {
  if (file !== undefined) return await FileTransactionIdsStore.create(file);
  if (url !== undefined) return new RemoteTransactionIdsStore(url, id);
  return new LocalTransactionIdsStore();
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
  ids: TransactionId[] = [];

  static async create(file?: string) {
    const self = new FileTransactionIdsStore();
    if (file !== undefined) await self.load(file);
    return self;
  }

  addTransactionId(id: TransactionId): Promise<void> {
    this.ids.push(id);
    return Promise.resolve();
  }
  getTransactionIds(): Promise<TransactionId[]> {
    return Promise.resolve([...this.ids]);
  }

  commit(file: string) {
    return this.store(file);
  }

  async load(file: string) {
    this.ids = JSON.parse((await readFile(file)).toString()).map(fromJSON);
  }
  async store(file: string) {
    await writeFile(file, JSON.stringify(this.ids.map(toJSON)));
  }
}

export class RemoteTransactionIdsStore
  extends RemoteService
  implements TransactionIdsStore
{
  async addTransactionId(id: TransactionId): Promise<void> {
    const json = toJSON(id);
    await this.post('/transaction-id', json);
  }

  async getTransactionIds(): Promise<TransactionId[]> {
    const res: any[] = await this.get('/transaction-ids');
    return res.map((d) => fromJSON(d));
  }

  commit() {
    return Promise.resolve();
  }
}

function fromJSON(data: any): TransactionId {
  return {
    isSuccess: true,
    async wait(options?: { maxAttempts?: number; interval?: number }) {
      // default is 45 attempts * 20s each = 15min
      // the block time on berkeley is currently longer than the average 3-4min, so its better to target a higher block time
      // fetching an update every 20s is more than enough with a current block time of 3min
      let maxAttempts = options?.maxAttempts ?? 45;
      let interval = options?.interval ?? 20000;
      let attempts = 0;

      const executePoll = async (
        resolve: () => void,
        reject: (err: Error) => void | Error
      ) => {
        let txId = data.sendZkapp?.zkapp?.id;
        let res;
        try {
          res = await fetchTransactionStatus(txId);
        } catch (error) {
          return reject(error as Error);
        }
        attempts++;
        if (res === 'INCLUDED') {
          return resolve();
        } else if (maxAttempts && attempts === maxAttempts) {
          return reject(
            new Error(
              `Exceeded max attempts. TransactionId: ${txId}, attempts: ${attempts}, last received status: ${res}`
            )
          );
        } else {
          setTimeout(executePoll, interval, resolve, reject);
        }
      };

      return new Promise(executePoll);
    },
    hash() {
      return data.sendZkapp?.zkapp?.hash;
    },
  };
}

function toJSON(txId: TransactionId) {
  return (txId as any).data;
}
