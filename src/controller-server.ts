import express, { Express, Request, Response } from 'express';
import { Logger } from 'tslog';
import { Command } from '@commander-js/extra-typings';
import { readFile } from 'fs/promises';
import { myParseInt } from './parse-int.js';
import { LOG } from './log.js';

interface JobConfiguration {
  name: string;
  workers: number;
  count: number;
  data: any;
}

interface JobRuntimeConfig {
  workers: number;
  count: number;
  data: any;
}

export class ControllerServer {
  jobs: Map<string, JobRuntimeConfig>;
  nodes: string[];
  accounts: string[];

  log: Logger<any>;

  totalWorkers: number;
  initWorkers: number;
  allWorkersReady: boolean;

  constructor(
    accounts: string[],
    nodes: string[],
    config: JobConfiguration[],
    log: Logger<any>
  ) {
    this.jobs = new Map(
      config.map((e) => [
        e.name,
        { workers: e.workers, count: e.count, data: e.data },
      ])
    );
    this.nodes = nodes;
    this.accounts = accounts;
    this.log = log.getSubLogger({ name: 'controller' });

    this.totalWorkers = config.reduce((a, v) => a + v.workers, 0);
    this.initWorkers = 0;
    this.allWorkersReady = false;
  }

  init() {
    let jobs = Array.from(this.jobs, ([name, c]) => ({
      name,
      workers: c.workers,
      data: c.data,
    }));
    let jobIndex = 0;
    let accountIndex = 0;
    let nodesIndex = 0;
    return (_req: Request, res: Response) => {
      if (
        this.allWorkersReady ||
        accountIndex >= this.accounts.length ||
        jobIndex >= jobs.length
      ) {
        res.json({});
        return;
      }
      const job = jobs[jobIndex];
      if (--job.workers === 0) {
        jobIndex++;
      }
      const account = this.accounts[accountIndex++];
      const graphql = this.nodes[nodesIndex++ % this.nodes.length];
      const config = {
        name: job.name,
        account,
        graphql,
        data: job.data,
      };
      this.initWorkers++;
      this.log.info(
        `Initializing worker #${this.initWorkers} of ${this.totalWorkers} for ${job.name}`
      );
      res.status(200).json({ config });
    };
  }

  ready() {
    let readyJobs = new Set();
    return (req: Request<{ id: String }>, res: Response) => {
      const id = req.params.id;
      readyJobs.add(id);
      this.allWorkersReady = readyJobs.size >= this.totalWorkers;
      if (this.allWorkersReady) {
        this.log.info(`Releasing worker ${id}`);
      } else {
        this.log.info(
          `Pausing worker ${id} as only ${readyJobs.size} jobs are ready out of ${this.totalWorkers}`
        );
      }
      res.json(this.allWorkersReady);
    };
  }

  moreWork() {
    return (req: Request, res: Response) => {
      const name = req.params.job;
      const job = this.jobs.get(name);
      if (job === undefined) {
        res.status(404).json({ error: `no job ${name}` });
        return;
      }
      if (job.count > 0) {
        job.count--;
        this.log.info(`Providing work for ${name}, ${job.count} work left`);
        res.json(true);
      } else {
        this.log.info('No work left');
        res.json(false);
      }
    };
  }

  createApp() {
    const app: Express = express();
    app.get('/init', this.init());
    app.get('/ready/:id', this.ready());
    app.get('/work/:job', this.moreWork());
    return app;
  }
}

export const command = new Command();

command
  .name('controller')
  .option('-p, --port <number>', 'port to listen at', myParseInt, 3000)
  .option(
    '-a, --accounts-file <file>',
    'file with private keys',
    'accounts.txt'
  )
  .option('-n, --nodes-file <file>', 'file with GraphQL nodes', 'nodes.txt')
  .option(
    '-c, --config-file <file>',
    'configuration of the network, list of graphql endpoints and accounts',
    'config.json'
  )
  .action(
    async ({
      port,
      accountsFile,
      nodesFile,
      configFile,
    }: {
      port: number;
      accountsFile: string;
      nodesFile: string;
      configFile: string;
    }) => {
      let log = LOG;
      const accounts = (await readFile(accountsFile)).toString().split('\n');
      const nodes = (await readFile(nodesFile)).toString().split('\n');
      const config = JSON.parse(
        (await readFile(configFile)).toString()
      ) as JobConfiguration[];
      let controller = new ControllerServer(accounts, nodes, config, log);
      controller
        .createApp()
        .listen(port, () =>
          log.info(`⚡️[server]: Server is running at http://localhost:${port}`)
        );
    }
  );
