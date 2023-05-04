interface NodesSource {
  /** returns GraphQL endpoints for Mina nodes */
  getNodes(): string[];
}
