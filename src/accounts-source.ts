import { fetchAccount, Mina, PrivateKey, PublicKey, Types } from 'o1js';
import { RemoteService } from './remote-access.js';

export interface AccountSource {
  /** returns existing account private key */
  getPrivateKey(): Promise<PrivateKey>;
  // /** returns private key for the account previously returned by `getAccount` */
  // getKey(account: PublicKey): Promise<PrivateKey>;
}

export function accountSource(
  keys?: string[],
  url?: string,
  id?: string
): AccountSource {
  if (keys) return new PrivateKeysSource(keys);
  if (url) return new RemoteKeysSource(url, id);
  throw new Error('empty account sources');
}

export type LocalBlockchain = ReturnType<typeof Mina.LocalBlockchain>;

export class LocalBlockchainAccountSource implements AccountSource {
  nextAccount: number = 0;
  localBlockchain: LocalBlockchain;
  knownAccounts: Map<PublicKey, PrivateKey> = new Map();

  constructor(localBlockchain: LocalBlockchain) {
    this.localBlockchain = localBlockchain;
  }

  getPrivateKey(): Promise<PrivateKey> {
    const index = this.knownAccounts.size;
    let { publicKey, privateKey } = this.localBlockchain.testAccounts[index];
    this.knownAccounts.set(publicKey, privateKey);
    return Promise.resolve(privateKey);
  }
  // getKey(account: PublicKey): Promise<PrivateKey> {
  //     const privateKey = this.knownAccounts.get(account);
  //     return privateKey ? Promise.resolve(privateKey) : Promise.reject(new Error(`unknown account: ${account}`));
  // }
}

export class PrivateKeysSource implements AccountSource {
  index: number = 0;
  keys: PrivateKey[];

  constructor(keys: string[]) {
    this.keys = keys.map(PrivateKey.fromBase58);
  }
  getPrivateKey(): Promise<PrivateKey> {
    return this.index < this.keys.length
      ? Promise.resolve(this.keys[this.index++])
      : Promise.reject(`no more accounts`);
  }
  // getKey(account: PublicKey): Promise<PrivateKey> {
  //     const key = this.keys.find(key => key.toPublicKey() == account);
  //     return key ? Promise.resolve(key) : Promise.reject(new Error(`unknown account: ${account}`));
  // }
}

export class RemoteKeysSource extends RemoteService implements AccountSource {
  async getPrivateKey(): Promise<PrivateKey> {
    const k = await this.get<string>('/account');
    return PrivateKey.fromBase58(k);
  }
}
