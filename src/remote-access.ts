import fetch from 'node-fetch';

export class RemoteService {
  remoteUrl: URL;
  id?: string;

  constructor(remote: string, id?: string) {
    this.remoteUrl = new URL(remote);
    this.id = id;
  }

  protected url(path: string) {
    return new URL(path, this.remoteUrl);
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      Accepts: 'application/json',
      'X-ZkApp-ID': this.id || '',
    };
  }

  private async fetch<O>(path: string, body?: any, method?: string) {
    const res = await fetch(this.url(path), {
      body,
      method,
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(
        `error accessing ${path}: status ${res.status}, ${res.statusText}`
      );
    }
    return <O>await res.json();
  }

  protected async get<O>(path: string): Promise<O> {
    return await this.fetch(path);
  }

  protected async put(path: string, body: any) {
    await this.fetch(path, body, 'PUT');
  }

  protected async post(path: string, body: any) {
    await this.fetch(path, body, 'POST');
  }
}
