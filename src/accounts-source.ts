import { fetchAccount, Mina, PrivateKey, PublicKey, Types } from 'snarkyjs';
import { Logger } from 'tslog';
import { makeGraphqlRequest } from './fetch.js';
import { LOG } from './log.js';
import { MinaConnection, MinaGraphQL } from './mina-connection.js';
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

const accountQuery = (pk: string) => `{
account(publicKey: "${pk}") {
    nonce
    inferredNonce
    balance {
      total
    }
  }
}`;

export class PrivateKeysSource implements AccountSource {
  index: number = 0;
  mina: (MinaConnection & MinaGraphQL) | undefined;
  keys: PrivateKey[];

  log: Logger<any>;

  constructor(keys: string[], mina?: MinaConnection & MinaGraphQL) {
    this.keys = keys.map(PrivateKey.fromBase58);
    this.mina = mina;
    this.log = LOG.getSubLogger({ name: 'acc-src' });
  }
  async getPrivateKey(): Promise<PrivateKey> {
    if (this.mina === undefined) {
      if (this.index >= this.keys.length) {
        throw new Error('no more accounts');
      }
      return this.keys[this.index++];
    }
    while (this.index < this.keys.length) {
      const sk = this.keys[this.index++];
      const pk = sk.toPublicKey().toBase58();
      const [resp, error] = await makeGraphqlRequest(
        accountQuery(pk),
        this.mina.graphql(),
        []
      );
      if (error) throw Error(error.statusText);
      let acc = resp?.data.account;
      this.log.debug('account', pk, acc);
      if (
        acc.balance.total >= 1000000 * 1e9 &&
        acc.nonce == acc.inferredNonce
      ) {
        return sk;
      }
    }
    throw new Error('no more accounts');
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
