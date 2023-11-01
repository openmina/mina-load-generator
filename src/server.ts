import { readFile } from 'fs/promises';
import { Command } from '@commander-js/extra-typings';
import express from 'express';
import { LOG } from './log.js';
import { myParseInt } from './parse-int.js';
import { AddressInfo } from 'net';
import { Logger } from 'tslog';

export class DataServer {
  nodes: string[];
  accounts: string[];

  txs: any[] = [];
  txIds: any[] = [];
  cycleTransactions: boolean;

  log: Logger<any>;

  constructor(
    nodes: string[],
    accounts: string[],
    cycleTransactions: boolean,
    log: Logger<any>
  ) {
    this.nodes = nodes;
    this.accounts = accounts;
    this.cycleTransactions = cycleTransactions;
    this.log = log;
    log.debug(`${nodes.length} nodes, ${accounts.length} accounts`);
  }

  createApp() {
    const app = express();

    app.use((req, _res, next) => {
      this.log.debug(`${req.method} ${req.path}`);
      next();
    });

    app.get('/healthcheck', (_req, res) => {
      res.sendStatus(200);
    });

    app.get('/nodes', (_req, res) => {
      res.json([...this.nodes]);
      const first = this.nodes.shift();
      if (first !== undefined) this.nodes.push(first);
    });

    app.get('/account', (_req, res) => {
      let tx = this.accounts.shift();
      if (tx === undefined) {
        this.log.warn('no more accounts');
        res.status(404).json('no more accounts');
        return;
      }
      this.log.debug('accounts left:', this.accounts.length);
      res.json(tx);
    });

    app.post(
      '/transaction',
      express.json({ limit: '10Mb', strict: false }),
      (req, res) => {
        this.log.debug('received transaction');
        this.log.trace('transaction:', req.body);
        this.txs.push(req.body);
        res.status(200).json(null);
        this.log.debug('transaction templates count:', this.txs.length);
      }
    );
    app.get('/transaction', (_req, res) => {
      const tx = this.txs.shift();
      if (tx === undefined) {
        this.log.warn('no transaction templates');
        res.status(404).json('no transaction templates');
        return;
      }
      if (this.cycleTransactions) {
        this.txs.push(tx);
      } else {
        this.log.debug('transaction templates count:', this.txs.length);
      }
      res.json(tx).send();
    });

    app.post('/transaction-id', express.json(), (req, res) => {
      this.txIds.push(req.body);
      res.status(200).json(null);
      this.log.debug('transaction ids count:', this.txIds.length);
    });
    app.get('/transaction-ids', (_req, res) => {
      if (this.txIds.length === 0) {
        this.log.warn('no transaction ids');
        res.status(404).json('no transaction ids');
        return;
      }
      res.json(this.txIds);
      this.txIds = [];
      this.log.debug('no transaction ids left');
    });

    return app;
  }
}

async function readJSON(file: string): Promise<any> {
  let data;
  try {
    data = await readFile(file);
  } catch (cause) {
    throw new Error(`cannot read file ${file}`, { cause });
  }
  try {
    return JSON.parse(data.toString());
  } catch (cause) {
    throw new Error(`cannot parse content of the file ${file}`, { cause });
  }
}

export function getNodes(nds: any) {
  let nodes: string[];
  if (!Array.isArray(nds)) {
    throw new Error(`nodes file does not contains an array`);
  }
  nodes = nds.map((n) => {
    if (typeof n === 'string') return n as string;
    throw new Error(`cannot get node URL ${n}`);
  });
  return nodes;
}

export function getAccounts(accs: any) {
  let accounts: string[];
  if (!Array.isArray(accs)) {
    throw new Error(`accounts file does not contains an array`);
  }
  accounts = accs.map((e) => {
    type A = { privateKey: string };
    if (e === undefined)
      throw new Error(`cannot get account's private key out of ${e}`);
    if (typeof e === 'string') return e as string;
    const privateKey = (e as A).privateKey;
    if (privateKey !== undefined) return privateKey;
    throw new Error(`cannot get account's private key out of ${e}`);
  });
  return accounts;
}

export const serverCommand = new Command('server')
  .description('data storage server that generator can use')
  .option('-p, --port <number>', 'port to listen to', myParseInt)
  .option('-h, --host <ip-address>', 'interface to listen for', '127.0.0.1')
  .option(
    '-n, --nodes-file <file>',
    'JSON file containing a list of URLs providing Mina GraphQL API',
    'nodes.json'
  )
  .option(
    '-a, --accounts-file <file>',
    'JSON file containing a list of existing private keys',
    'accounts.json'
  )
  .option('-c, --cycle-transactions', 'cycle throuth transactions', false)
  .action(async (opts) => {
    const log = LOG.getSubLogger({ name: 'srv' });
    const { port, host, nodesFile, accountsFile, cycleTransactions } = opts;
    const nodes = getNodes(await readJSON(nodesFile));
    const accounts = getAccounts(await readJSON(accountsFile));

    const app = new DataServer(
      nodes,
      accounts,
      cycleTransactions,
      log
    ).createApp();
    const server = app.listen(port || 0, host);
    server.on('listening', () => {
      const addr = server.address() as AddressInfo;
      log.info(`listening on port ${addr.address}:${addr.port}`);
    });
  });
