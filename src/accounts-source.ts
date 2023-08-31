import { Mina, PrivateKey, PublicKey } from 'snarkyjs';
import { Logger } from 'tslog';
import { makeGraphqlRequest } from './fetch.js';
import { LOG } from './log.js';
import {
  isMinaGraphQL,
  MinaConnection,
  MinaGraphQL,
} from './mina-connection.js';
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
    publicKey
    nonce
    inferredNonce
    balance {
      total
    }
  }
}`;

interface AccountGraphql {
  publicKey: string;
  nonce: string;
  inferredNonce: string;
  balance: {
    total: string;
  };
}

export interface Account {
  publicKey: PublicKey;
  nonce: number;
  inferredNonce: number;
  balance: number;
}

function parseAccount(value: AccountGraphql): Account {
  let {
    publicKey,
    nonce,
    inferredNonce,
    balance: { total: balance },
  } = value;
  return {
    publicKey: PublicKey.fromBase58(publicKey),
    nonce: parseInt(nonce, 10),
    inferredNonce: parseInt(inferredNonce, 10),
    balance: parseInt(balance, 10),
  };
}

export async function fetchAccount(
  pk: PublicKey,
  mina: MinaConnection
): Promise<Account> {
  if (!isMinaGraphQL(mina)) {
    let acc = await mina.getAccount(pk);
    let nonce = parseInt(acc.nonce.toBigint().toString(), 10);
    let balance = parseInt(acc.balance.toString(), 10);
    return {
      publicKey: pk,
      nonce,
      inferredNonce: nonce,
      balance,
    };
  }
  const [resp, error] = await makeGraphqlRequest(
    accountQuery(pk.toBase58()),
    mina
  );

  if (error) throw Error(error.statusText);
  return parseAccount(resp?.data.account);
}

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
      let acc = await fetchAccount(sk.toPublicKey(), this.mina);
      if (acc.balance >= 1000000 * 1e9 && acc.nonce == acc.inferredNonce) {
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
