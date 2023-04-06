import { Logger } from 'tslog';
import fetch from 'node-fetch';
import { setTimeout } from 'timers/promises';

export interface Controller {
  getJobConfiguration(): Promise<any>;

  notifyReadyAndWaitForOthers(key: any): Promise<void>;

  getMoreWork(): Promise<any>;
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

  async getJobConfiguration(): Promise<any> {
    let { config } = await this.fetch<any>('/init');
    this.job = config?.name;
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

  async getMoreWork<W>(): Promise<W | undefined> {
    let { data } = await this.fetch<{ data?: any }>(this.workUrl());
    this.log.trace('work fetched: ', data);
    return data;
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
