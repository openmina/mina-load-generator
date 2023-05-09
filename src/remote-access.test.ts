import { Server, AddressInfo } from 'net';
import { Logger } from 'tslog';
import { LOG } from './log';
import { RemoteService } from './remote-access';
import { DataServer } from './server';

let server: Server | undefined;
let port: number;

beforeEach((done) => {
  server = new DataServer([], [], new Logger()).createApp().listen();
  server.on('listening', () => {
    port = (server?.address() as AddressInfo).port;
    done();
  });
});
afterEach((done) => {
  if (server) {
    server.close(done);
    server = undefined;
  } else done();
});

describe('remote access primitives with simple server', () => {
  it('should post data to /transaction and then get it back', async () => {
    const client = new (class extends RemoteService {
      constructor() {
        super(`http://localhost:${port}`);
      }
      send(data: any) {
        return this.post('/transaction', data);
      }
      receive() {
        return this.get<any>('/transaction');
      }
    })();
    const data = { someField: 'someData' };
    await client.send(data);
    await expect(client.receive()).resolves.toMatchObject(data);
  });
  it('should post data to /transaction-id and then get it back', async () => {
    const client = new (class extends RemoteService {
      constructor() {
        super(`http://localhost:${port}`);
      }
      send(data: any) {
        return this.post('/transaction-id', data);
      }
      receive() {
        return this.get<any>('/transaction-ids');
      }
    })();
    const data = [{ someField: 'someData' }, { someField: 'otherData' }];
    for (let id of data) {
      await client.send(id);
    }
    await expect(client.receive()).resolves.toMatchObject(data);
  });
});
