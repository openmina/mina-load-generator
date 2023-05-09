import { fetchAccount, Mina, PublicKey, Types } from 'snarkyjs';
import { NodesSource } from './nodes-source';
import { setTimeout } from 'timers/promises';

export interface MinaConnection {
  /** connects to the next Mina node, if available */
  nextNode(): void;

  /** fetches account data from the connected blockchain */
  getAccount(
    publicKey: PublicKey,
    options?: { retries: number; period: number }
  ): Promise<Types.Account>;
}

export interface MinaGraphQL {
  /** returns GraphQL endpoint URL */
  graphql(): string;
}

type LocalBlockchain = ReturnType<typeof Mina.LocalBlockchain>;

export class LocalBlockchainConnection implements MinaConnection {
  localBlockchain: LocalBlockchain;

  constructor(localBlockchain: LocalBlockchain) {
    this.localBlockchain = localBlockchain;
    Mina.setActiveInstance(localBlockchain);
  }

  nextNode(): void {
    throw new Error(
      'Local blockchain does not support multiple node switching'
    );
  }

  getAccount(publicKey: PublicKey): Promise<Types.Account> {
    return Promise.resolve(this.localBlockchain.getAccount(publicKey));
  }
}

export class MinaBlockchainConnection implements MinaConnection {
  endpoints: string[];
  currentEndpoint: number;

  static async create(nodes: NodesSource) {
    let endpoints = await nodes.getNodes();
    return new MinaBlockchainConnection(endpoints);
  }

  private constructor(endpoints: string[]) {
    this.endpoints = endpoints;
    this.currentEndpoint = 0;
    Mina.setActiveInstance(Mina.Network(this.endpoints[0]));
  }
  private graphql(): string {
    return this.endpoints[this.currentEndpoint];
  }

  nextNode(): void {
    if (this.currentEndpoint + 1 >= this.endpoints.length)
      throw new Error('no next Mina node');
    this.currentEndpoint++;
    Mina.setActiveInstance(Mina.Network(this.endpoints[this.currentEndpoint]));
  }

  async getAccount(
    publicKey: PublicKey,
    options: { retries: number; period: number }
  ): Promise<Types.Account> {
    const res:
      | { account: Types.Account; error: undefined }
      | { account: undefined; error: any } = await fetchAccount(
      { publicKey },
      this.graphql()
    );
    if (res.account !== undefined) {
      return res.account;
    } else {
      throw new Error(`cannot fetch account ${publicKey.toBase58()}`, {
        cause: res.error,
      });
    }
  }
}
