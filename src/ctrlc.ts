import { EventEmitter } from 'events';
import { LOG } from './log.js';

let emitter: EventEmitter | undefined = new EventEmitter();
let log = LOG.getSubLogger({ name: 'ctrlc' });

process.on('SIGINT', sigintHandler);

function sigintHandler() {
  if (emitter !== undefined && emitter.listenerCount('terminating') > 0) {
    log.info('caught SIGINT, executing handlers...');
    let e = emitter;
    emitter = undefined;
    let num = e.listenerCount('terminating');
    let done = () => {
      if (--num <= 0) {
        log.info('exiting');
        process.exit(2);
      }
    };
    e.emit('terminating', done);
  } else {
    log.info('caught second SIGINT, forcing exit...');
    process.exit(2);
  }
}

export function addHandler<T>(handler: () => Promise<T>) {
  if (emitter !== undefined) {
    emitter.on('terminating', (done) => {
      handler().then(done).catch(done);
    });
  }
}
