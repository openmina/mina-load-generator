import { RemoteService } from './remote-access.js';

export interface NodesSource {
  /** returns GraphQL endpoints for Mina nodes */
  getNodes(): Promise<string[]>;
}

export function nodesSource(nodes?: string[], url?: string, id?: string) {
  if (url !== undefined) return new RemoteNodeSource(url, id);
  if (nodes !== undefined) return new ListNodeSource(nodes);
  throw new Error('no input for nodes source');
}

export class ListNodeSource implements NodesSource {
  nodes: string[];
  constructor(nodes: string[]) {
    this.nodes = nodes;
  }
  getNodes(): Promise<string[]> {
    return Promise.resolve([...this.nodes]);
  }
}

export class RemoteNodeSource extends RemoteService implements NodesSource {
  getNodes(): Promise<string[]> {
    return this.get('/nodes');
  }
}
