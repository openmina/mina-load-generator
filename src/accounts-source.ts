import { fetchAccount, Mina, PrivateKey, PublicKey, Types } from 'snarkyjs';
import { MinaGraphQL } from './mina-connection.js';

export interface AccountSource {
  /** returns existing account private key */
  getPrivateKey(): Promise<PrivateKey>;
  // /** returns private key for the account previously returned by `getAccount` */
  // getKey(account: PublicKey): Promise<PrivateKey>;

  getAccount(publicKey: PublicKey): Promise<Types.Account>;
}

export type LocalBlockchain = ReturnType<typeof Mina.LocalBlockchain>;

export class LocalBlockchainAccountSource implements AccountSource {
  nextAccount: number = 0;
  localBlockchain: LocalBlockchain;
  knownAccounts: Map<PublicKey, PrivateKey> = new Map();

  constructor(localBlockchain: LocalBlockchain) {
    this.localBlockchain = localBlockchain;
  }

  getAccount(publicKey: PublicKey): Promise<Types.Account> {
    return Promise.resolve(this.localBlockchain.getAccount(publicKey));
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

class RemoteBlockchainAccountAccess {
  mina: MinaGraphQL;
  constructor(mina: MinaGraphQL) {
    this.mina = mina;
  }
  async getAccount(publicKey: PublicKey): Promise<Types.Account> {
    const res:
      | { account: Types.Account; error: undefined }
      | { account: undefined; error: any } = await fetchAccount(
      { publicKey },
      this.mina.graphql()
    );
    if (res.account !== undefined) {
      return res.account;
    } else {
      throw new Error(
        `cannot fetch account information for ${publicKey.toBase58()}`,
        { cause: res.error }
      );
    }
  }
}

export class PrivateKeysSource
  extends RemoteBlockchainAccountAccess
  implements AccountSource
{
  index: number = 0;
  keys: PrivateKey[];

  constructor(mina: MinaGraphQL, keys: string[]) {
    super(mina);
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
