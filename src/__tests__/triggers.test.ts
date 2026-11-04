import { startTriggers } from '../upload/triggers';

it('kicks the engine when the network returns and when the app is foregrounded, not when it drops', () => {
  let netCb: (o: boolean) => void = () => undefined;
  let appCb: () => void = () => undefined;
  const kick = jest.fn(async () => undefined);
  const seen: boolean[] = [];
  const stop = startTriggers({
    engine: { kick },
    watchNetwork: cb => ((netCb = cb), () => undefined),
    watchAppActive: cb => ((appCb = cb), () => undefined),
    onOnlineChange: o => seen.push(o),
  });
  netCb(false);
  expect(kick).not.toHaveBeenCalled();
  netCb(true);
  expect(kick).toHaveBeenCalledTimes(1);
  appCb();
  expect(kick).toHaveBeenCalledTimes(2);
  expect(seen).toEqual([false, true]);
  stop();
});
