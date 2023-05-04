import { Mina } from 'snarkyjs';

export interface MinaConnection {
  /** connects to the next Mina node, if available */
  nextNode(): void;
}

export interface MinaGraphQL {
  /** returns GraphQL endpoint URL */
  graphql(): string;
}

type LocalBlockchain = ReturnType<typeof Mina.LocalBlockchain>;

export class LocalBlockchainConnection implements MinaConnection {
  constructor(localBlockchain: LocalBlockchain) {
    Mina.setActiveInstance(localBlockchain);
  }

  nextNode(): void {
    throw new Error(
      'Local blockchain does not support multiple node switching'
    );
  }
}

export class MinaBlockchainConnection implements MinaConnection, MinaGraphQL {
  endpoints: string[];
  currentEndpoint: number;

  constructor(endpoints: string[]) {
    this.endpoints = endpoints;
    this.currentEndpoint = 0;
    Mina.setActiveInstance(Mina.Network(this.endpoints[0]));
  }

  graphql(): string {
    return this.endpoints[this.currentEndpoint];
  }
  nextNode(): void {
    if (this.currentEndpoint + 1 >= this.endpoints.length)
      throw new Error('no next Mina node');
    this.currentEndpoint++;
    Mina.setActiveInstance(Mina.Network(this.endpoints[this.currentEndpoint]));
  }
}
