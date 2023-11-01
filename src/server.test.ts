import { DataServer, getAccounts, getNodes } from './server.js';
import { Express } from 'express';
import { agent as request } from 'supertest';
import { Logger } from 'tslog';

const log = new Logger({ minLevel: 3 });

describe('/healthcheck function', () => {
  let app: Express;
  beforeEach(() => {
    app = new DataServer([], [], false, log).createApp();
  });

  it('should reply OK status', async () => {
    const res = await request(app).get('/healthcheck');
    expect(res.status).toBe(200);
  });
});

describe('/nodes function', () => {
  const nodes = ['node1', 'node2', 'node3'];
  let app: Express;
  beforeEach(() => {
    app = new DataServer([...nodes], [], false, log).createApp();
  });

  it('should return the list of nodes as the first request', async () => {
    const res = await request(app)
      .get('/nodes')
      .set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(nodes);
  });
  it('should return list with different first node each time', async () => {
    const ns = new Set();
    for (let i = 0; i < nodes.length; i++) {
      const res = await request(app)
        .get('/nodes')
        .set('Accept', 'application/json');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(nodes.length);
      ns.add(res.body[0]);
    }
    expect(ns.size).toBe(nodes.length);
  });
  it('should return nodes after passing last node', async () => {
    for (let i = 0; i < nodes.length * 2; i++) {
      const res = await request(app)
        .get('/nodes')
        .set('Accept', 'application/json');
      expect(res.status).toBe(200);
    }
  });
});

describe('/accounts', () => {
  const accs = ['account1', 'account2', 'account3'];
  let dataServer: DataServer;
  let app: Express;
  beforeEach(() => {
    dataServer = new DataServer([], [...accs], false, log);
    app = dataServer.createApp();
  });

  it('should return different accounts in turn', async () => {
    const a = new Set(accs);
    for (let _ of accs.keys()) {
      const res = await request(app)
        .get('/account')
        .set('Accept', 'application/json');
      expect(res.status).toBe(200);
      expect(a.delete(res.body));
    }
    expect(a.size).toBe(0);
  });

  it('should return 404 past last account', async () => {
    for (let _ of accs.keys()) {
      const res = await request(app)
        .get('/account')
        .set('Accept', 'application/json');
      expect(res.status).toBe(200);
    }
    const res = await request(app)
      .get('/account')
      .set('Accept', 'application/json');
    expect(res.status).toBe(404);
  });
});

describe('transaction templates storage', () => {
  let dataServer: DataServer;
  let app: Express;
  beforeEach(() => {
    dataServer = new DataServer([], [], false, log);
    app = dataServer.createApp();
  });

  it('should return transaction template previously added', async () => {
    const tx = { someField: 'some data' };

    const post = await request(app)
      .post('/transaction')
      .set('Accept', 'application/json')
      .send(tx);
    expect(post.status).toBe(200);

    const get = await request(app)
      .get('/transaction')
      .set('Accept', 'application/json');
    expect(get.status).toBe(200);
    expect(get.body).toMatchObject(tx);
  });

  it('should return error if no transaction template previously added', async () => {
    const get = await request(app)
      .get('/transaction')
      .set('Accept', 'application/json');
    expect(get.status).toBe(404);
  });

  it('should return transactions previously added', async () => {
    // TODO
  });

  it('should return error if runs out of transactions', async () => {
    const txs = [{ someField: 'some data' }, { someField: 'other data' }];

    for (let tx of txs) {
      const post = await request(app)
        .post('/transaction')
        .set('Accept', 'application/json')
        .send(tx);
      expect(post.status).toBe(200);
    }

    for (let _ of txs) {
      const get = await request(app)
        .get('/transaction')
        .set('Accept', 'application/json');
      expect(get.status).toBe(200);
    }

    const get = await request(app)
      .get('/transaction')
      .set('Accept', 'application/json');
    expect(get.status).toBe(404);
  });

  it('should cycle through transactions if configured', async () => {
    dataServer.cycleTransactions = true;
    const txs = [{ someField: 'some data' }, { someField: 'other data' }];

    for (let tx of txs) {
      const post = await request(app)
        .post('/transaction')
        .set('Accept', 'application/json')
        .send(tx);
      expect(post.status).toBe(200);
    }

    for (let i = 0; i < 2; i++) {
      for (let _ of txs) {
        const get = await request(app)
          .get('/transaction')
          .set('Accept', 'application/json');
        expect(get.status).toBe(200);
      }
    }
  });
  it('should report absence/presense of transactions', async () => {
    await expect(
      request(app)
        .head('/transaction')
        .then((head) => head.status)
    ).resolves.toBe(404);
    await expect(
      request(app)
        .post('/transaction')
        .send({ someField: 'some data' })
        .then((post) => post.status)
    ).resolves.toBe(200);
    await expect(
      request(app)
        .head('/transaction')
        .then((head) => head.status)
    ).resolves.toBe(200);
  });
});

describe('transaction ids storage', () => {
  let app: Express;
  beforeEach(() => {
    app = new DataServer([], [], false, log).createApp();
  });

  it('should return transaction ids previously added', async () => {
    const txs = [{ someField: 'some data' }, { someField: 'other data' }];

    for (let tx of txs) {
      const post = await request(app)
        .post('/transaction-id')
        .set('Accept', 'application/json')
        .send(tx);
      expect(post.status).toBe(200);
    }

    const get = await request(app)
      .get('/transaction-ids')
      .set('Accept', 'application/json');
    expect(get.status).toBe(200);
    expect(get.body).toMatchObject(txs);
  });

  it('should return error if no transaction id previously added', async () => {
    const get = await request(app)
      .get('/transaction-id')
      .set('Accept', 'application/json');
    expect(get.status).toBe(404);
  });

  it('should return transactions previously added', async () => {
    // TODO
  });

  it('should return error if no transaction id previously added', async () => {
    const txs = [{ someField: 'some data' }, { someField: 'other data' }];

    for (let tx of txs) {
      const post = await request(app)
        .post('/transaction-id')
        .set('Accept', 'application/json')
        .send(tx);
      expect(post.status).toBe(200);
    }

    const get = await request(app)
      .get('/transaction-ids')
      .set('Accept', 'application/json');
    expect(get.status).toBe(200);
    expect(get.body).toMatchObject(txs);

    const get2 = await request(app)
      .get('/transaction-ids')
      .set('Accept', 'application/json');
    expect(get2.status).toBe(404);
  });
});

describe('getNodes() function', () => {
  it('should convert list of strings', () => {
    const nodes = ['a', 'b', 'c'];
    expect(getNodes(nodes as any)).toMatchObject(nodes);
  });

  it('should report an error on non-string element', () => {
    expect(() => getNodes(['a', undefined, 'd'])).toThrow();
    expect(() => getNodes(['a', null, 'd'])).toThrow();
    expect(() => getNodes(['a', 9, 'd'])).toThrow();
    expect(() => getNodes(['a', {}, 'd'])).toThrow();
    expect(() => getNodes(['a', [], 'd'])).toThrow();
  });
});

describe('getAccounts() function', () => {
  it('should convert a list of strings', () => {
    const accounts = ['a', 'b', 'c'];
    expect(getAccounts(accounts as any)).toMatchObject(accounts);
  });

  it('should convert a list of objects with `privateKey` field', () => {
    const accounts = [
      { privateKey: 'a' },
      { privateKey: 'b' },
      { privateKey: 'c' },
    ];
    expect(getAccounts(accounts as any)).toMatchObject(['a', 'b', 'c']);
  });

  it('should convert a list of mixed standard data', () => {
    const accounts = [{ privateKey: 'a' }, 'b', { privateKey: 'c' }];
    expect(getAccounts(accounts as any)).toMatchObject(['a', 'b', 'c']);
  });

  it('should report an error on non-standard element', () => {
    expect(() => getAccounts(['a', undefined, 'd'])).toThrow();
    expect(() => getAccounts(['a', null, 'd'])).toThrow();
    expect(() => getAccounts(['a', 9, 'd'])).toThrow();
    expect(() => getAccounts(['a', {}, 'd'])).toThrow();
    expect(() => getAccounts(['a', [], 'd'])).toThrow();
  });
});
