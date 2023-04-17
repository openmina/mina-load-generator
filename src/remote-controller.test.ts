import { Controller, RemoteControllerClient } from './controller.js';
import { Server, AddressInfo } from 'net';
import { ControllerServer } from './controller-server';
import { Logger } from 'tslog';
import { setTimeout as timeout } from 'timers/promises';

let server: Server | undefined;
afterEach((done) => {
  if (server !== undefined) {
    server.close(() => {
      console.log('server is closed');
      server = undefined;
      done();
    });
  } else {
    done();
  }
});

function createController(config?: any, accounts?: string[], nodes?: string[]) {
  const accs = accounts ?? ['acc1', 'acc2', 'acc3'];
  const ns = nodes ?? ['node1'];
  const cfg = config ?? { name: '', workers: 0, count: 0, data: {} };
  const log = new Logger();

  server = new ControllerServer(accs, ns, cfg, log).createApp().listen(() => {
    console.log(`server is listening`);
  });
  const address = server.address() as AddressInfo;
  const url = `http://localhost:${address.port}`;
  return new RemoteControllerClient(url, log, 100);
}

describe('job configurations', () => {
  let controller: Controller;
  beforeEach((done) => {
    controller = createController();
    done();
  });

  it('should provide configuration for all accounts', async () => {
    await expect(controller.getJobConfiguration()).resolves.toMatchObject({
      account: 'acc1',
    });
    expect(await controller.getJobConfiguration()).toMatchObject({
      account: 'acc2',
    });
    expect(await controller.getJobConfiguration()).toMatchObject({
      account: 'acc3',
    });
  });

  it('should not provide configuration when out of accounts', async () => {
    await controller.getJobConfiguration();
    await controller.getJobConfiguration();
    await controller.getJobConfiguration();
    await expect(controller.getJobConfiguration()).rejects.toThrow();
  });
});

describe('jobs readiness', () => {
  let controller: Controller;
  beforeEach((done) => {
    controller = createController({ name: '', workers: 2, count: 0, data: {} });
    done();
  });

  it('should not report readiness when not all workers are ready', async () => {
    await controller.getJobConfiguration();
    await controller.getJobConfiguration();
    await expect(
      Promise.any([
        controller.notifyReadyAndWaitForOthers('1').then(() => true),
        timeout(500).then(() => false),
      ])
    ).resolves.toBe(false);
    await expect(
      Promise.any([
        controller.notifyReadyAndWaitForOthers('2').then(() => true),
        timeout(500).then(() => false),
      ])
    ).resolves.toBe(true);
    await expect(
      Promise.any([
        controller.notifyReadyAndWaitForOthers('1').then(() => true),
        timeout(500).then(() => false),
      ])
    ).resolves.toBe(true);
  });

  it('should synchronously release workers when all initialized', async () => {
    // await controller.getJobConfiguration();
    // await controller.getJobConfiguration();
    await expect(
      Promise.all([
        controller.notifyReadyAndWaitForOthers('1'),
        controller.notifyReadyAndWaitForOthers('2'),
      ])
    ).resolves.toMatchObject([undefined, undefined]);
  });
  it('should not provide job configuration when all workers are initialized', async () => {
    // await controller.getJobConfiguration();
    // await controller.getJobConfiguration();
    await expect(
      Promise.all([
        controller.notifyReadyAndWaitForOthers('1'),
        controller.notifyReadyAndWaitForOthers('2'),
      ])
    ).resolves.toMatchObject([undefined, undefined]);

    await expect(controller.getJobConfiguration()).rejects.toThrow();
  });
});
