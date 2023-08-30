import { fetchAccount, Mina, PublicKey, Types } from 'snarkyjs';
import { NodesSource } from './nodes-source.js';
import { Logger } from 'tslog';
import { LOG } from './log.js';
import { isFetchError } from './fetch.js';

const log = LOG.getSubLogger({ name: 'conn' });

export interface MinaConnection {
  /** connects to the next Mina node, if available */
  nextNode(): void;

  /** returns the number of nodes */
  nodesCount(): number;

  /** fetches account data from the connected blockchain */
  getAccount(
    publicKey: PublicKey,
    options?: { retries: number; period: number }
  ): Promise<Types.Account>;
}

export async function retryWithConnection<T>(
  mina: MinaConnection,
  fn: () => Promise<T>
): Promise<T> {
  if (!isMinaGraphQL(mina)) {
    return await fn();
  }
  let retries = mina.nodesCount();
  while (true) {
    try {
      return await fn();
    } catch (e) {
      retries--;
      log.debug(`error received from ${mina.graphql()}: ${e}`, e);
      if (retries > 0 && isFetchError(e)) {
        if ([408, 500].includes(e.statusCode)) {
          mina.nextNode();
          log.debug(`switched to the next endpoint: ${mina.graphql()}`);
          continue;
        }
      }
      log.debug(`throwing error ${e}`);
      throw e;
    }
  }
}

export interface MinaGraphQL {
  /** returns GraphQL endpoint URL */
  graphql(): string;
}

export function isMinaGraphQL(
  v: MinaConnection | MinaGraphQL
): v is MinaGraphQL {
  return 'graphql' in v;
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

  nodesCount(): number {
    return 0;
  }

  getAccount(publicKey: PublicKey): Promise<Types.Account> {
    return Promise.resolve(this.localBlockchain.getAccount(publicKey));
  }
}

export class MinaBlockchainConnection implements MinaConnection, MinaGraphQL {
  endpoints: string[];
  currentEndpoint: number;
  log: Logger<any>;

  static async create(nodes: NodesSource) {
    let endpoints = await nodes.getNodes();
    return new MinaBlockchainConnection(
      endpoints,
      LOG.getSubLogger({ name: 'mina-connection' })
    );
  }

  private constructor(endpoints: string[], log: Logger<any>) {
    this.endpoints = endpoints;
    this.currentEndpoint = 0;
    this.log = log;
    this.setActiveInstance(this.endpoints[0]);
  }

  private setActiveInstance(endpoint: string) {
    this.log.debug('setting Mina endpoint', endpoint);
    Mina.setActiveInstance(Mina.Network(endpoint));
  }

  graphql(): string {
    return this.endpoints[this.currentEndpoint];
  }

  nodesCount(): number {
    return this.endpoints.length;
  }

  nextNode(): void {
    this.currentEndpoint = (this.currentEndpoint + 1) % this.endpoints.length;
    this.setActiveInstance(this.endpoints[this.currentEndpoint]);
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
