import { Logger } from 'tslog';
import fetch from 'node-fetch';
import { setTimeout } from 'timers/promises';
import { PrivateKey } from 'snarkyjs';

interface JobConfiguration {
  account: PrivateKey;
  graphql: string;
  name: string;
  data?: any;
}

export interface Controller {
  getJobConfiguration(): Promise<JobConfiguration | undefined>;

  notifyReadyAndWaitForOthers(key: any): Promise<void>;

  hasMoreWork(): Promise<boolean>;
}

export class LocalController {
  account: string;
  graphql: string;
  name: string;
  data?: any;
  count: number;

  constructor(
    account: string,
    graphql: string,
    name: string,
    count: number,
    data: any
  ) {
    this.account = account;
    this.graphql = graphql;
    this.name = name;
    this.data = data;
    this.count = count;
  }

  getJobConfiguration(): Promise<JobConfiguration | undefined> {
    return Promise.resolve({
      account: PrivateKey.fromBase58(this.account),
      graphql: this.graphql,
      name: this.name,
      data: this.data,
    });
  }

  notifyReadyAndWaitForOthers(_key: any): Promise<void> {
    return Promise.resolve();
  }

  hasMoreWork(): Promise<boolean> {
    return Promise.resolve(this.count-- > 0);
  }
}

export class RemoteControllerClient implements Controller {
  url: string;
  log: Logger<any>;
  job: string;
  constructor(url: string, log: Logger<any>) {
    this.url = url;
    this.log = log.getSubLogger();
  }

  async fetch<T>(path: string): Promise<T> {
    this.log.silly(`fetching ${path}...`);
    let res = await fetch(new URL(path, this.url).toString());
    let data = (await res.json()) as T;
    this.log.silly(`response: ${JSON.stringify(data)}`);
    return data;
  }

  async getJobConfiguration(): Promise<JobConfiguration | undefined> {
    let { config } = await this.fetch<any>('/init');
    if (config !== undefined) {
      this.job = config?.name;
      config.account = PrivateKey.fromBase58(config.account);
    }
    return config;
  }

  async ready(key: any): Promise<boolean> {
    return await this.fetch<boolean>(this.readyUrl(key));
  }

  async notifyReadyAndWaitForOthers(key: any) {
    this.log.debug(`notifying readiness as ${key}...`);
    while (!(await this.ready(key))) {
      this.log.info('Other jobs are not ready yet. Waiting...');
      await setTimeout(5 * 1000);
    }
    this.log.debug('other jobs are ready too');
  }

  async hasMoreWork(): Promise<boolean> {
    return this.fetch(this.workUrl());
  }

  waitUrl(): string {
    return '/wait';
  }

  readyUrl(key: any): string {
    return `/ready/${key}`;
  }

  workUrl(): string {
    return new URL(`/work/${this.job}`, this.url).toString();
  }
}
