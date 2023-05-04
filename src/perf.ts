import prettyTime from 'pretty-time';
import { Logger } from 'tslog';

const PERF_TRACE_LEVEL = 2;
const PERF_TRACE_NAME = 'PERF';

export function tracePerf<T>(msg: string, log: Logger<any>, fn: () => T): T {
  if (log.settings.minLevel > PERF_TRACE_LEVEL) {
    return fn();
  }
  log.log(PERF_TRACE_LEVEL, `${msg} started...`);
  const t = process.hrtime();
  let v = fn();
  const time = prettyTime(process.hrtime(t));
  log.log(PERF_TRACE_LEVEL, `${msg} finished in ${time}`);
  return v;
}

export async function tracePerfAsync<T>(
  msg: string,
  log: Logger<any>,
  fn: () => Promise<T>
): Promise<T> {
  if (log.settings.minLevel > PERF_TRACE_LEVEL) {
    return fn();
  }
  log.log(PERF_TRACE_LEVEL, PERF_TRACE_NAME, `${msg} started...`);
  const t = process.hrtime();
  const v = await fn();
  const time = prettyTime(process.hrtime(t));
  log.log(PERF_TRACE_LEVEL, PERF_TRACE_NAME, `${msg} finished in ${time}`);
  return v;
}
