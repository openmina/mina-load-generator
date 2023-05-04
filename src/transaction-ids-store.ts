import { readFile, writeFile } from 'fs/promises';
import { fetchTransactionStatus } from 'snarkyjs';
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
  ids: TransactionId[] = [];
  constructor(file: string) {
    this.file = file;
  }
  addTransactionId(id: TransactionId): Promise<void> {
    this.ids.push(id);
    return Promise.resolve();
  }
  getTransactionIds(): Promise<TransactionId[]> {
    return Promise.resolve([...this.ids]);
  }

  async load() {
    this.ids = JSON.parse((await readFile(this.file)).toString()).map(fromJSON);
  }
  async store() {
    await writeFile(this.file, JSON.stringify(this.ids.map(toJSON)));
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
