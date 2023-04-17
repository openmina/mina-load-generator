import { Logger } from 'tslog';
import fetch from 'node-fetch';
import { setTimeout } from 'timers/promises';

export interface JobConfiguration {
  account: string;
  graphql: string;
  name: string;
  data?: any;
}

export interface Controller {
  getJobConfiguration(): Promise<JobConfiguration>;

  notifyReadyAndWaitForOthers(key: any): Promise<void>;

  hasMoreWork(): Promise<boolean>;

  notifyDoneAndWaitForOthers(key: any): Promise<void>;
}

export class LocalController implements Controller {
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

  getJobConfiguration(): Promise<JobConfiguration> {
    return Promise.resolve({
      account: this.account,
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

  notifyDoneAndWaitForOthers(_: any) {
    return Promise.resolve();
  }
}

export class RemoteControllerClient implements Controller {
  url: string;
  log: Logger<any>;
  job: string;
  pollWait: number;
  constructor(url: string, log: Logger<any>, pollWait?: number) {
    this.url = url;
    this.log = log.getSubLogger();
    this.pollWait = pollWait ?? 5 * 1000;
  }

  async fetch<T>(path: string): Promise<T> {
    this.log.trace(`fetching ${path}...`);
    let res = await fetch(new URL(path, this.url).toString());
    if (res.ok) {
      const data = await res.json();
      this.log.trace('received response:', data);
      return data as T;
    } else {
      const body = await res.json();
      this.log.trace('received error:', body);
      const { error } = body as { error: string };
      throw new Error(error);
    }
  }

  async getJobConfiguration(): Promise<JobConfiguration> {
    const { config } = await this.fetch<any>('/init');
    if (config === undefined) {
      throw Error('Received undefined configuration');
    }
    this.job = config?.name;
    return config;
  }

  async ready(key: any): Promise<boolean> {
    return await this.fetch<boolean>(this.readyUrl(key));
  }

  async done(key: any): Promise<boolean> {
    return await this.fetch<boolean>(this.doneUrl(key));
  }

  async notifyReadyAndWaitForOthers(key: any) {
    this.log.info(`notifying readiness as ${key}...`);
    while (!(await this.ready(key))) {
      this.log.info('Other jobs are not ready yet. Waiting...');
      await setTimeout(this.pollWait);
    }
    this.log.info('other jobs are ready too');
  }

  async hasMoreWork(): Promise<boolean> {
    return this.fetch(this.workUrl());
  }

  async notifyDoneAndWaitForOthers(key: any): Promise<void> {
    this.log.info(`notifying done as ${key}...`);
    while (!(await this.done(key))) {
      this.log.info('Other jobs are not done yet. Waiting...');
      await setTimeout(5 * 1000);
    }
    this.log.info('other jobs are done too');
  }

  waitUrl(): string {
    return '/wait';
  }

  readyUrl(key: any): string {
    return `/ready/${key}`;
  }

  workUrl(): string {
    return `/work/${this.job}`;
  }

  doneUrl(key: any): string {
    return `/done/${key}`;
  }
}
