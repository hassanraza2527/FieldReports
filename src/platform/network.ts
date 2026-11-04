import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { config } from '../config/env';

/**
 * "Online" means "OUR SERVER answers", not "the phone has Wi-Fi": NetInfo's internet-reachability probe is
 * pointed at the backend's /health, so a LAN-only dev setup and captive portals are both handled correctly.
 */
export function configureNetInfo() {
  NetInfo.configure({
    reachabilityUrl: `${config.baseUrl}/health`,
    reachabilityTest: async res => res.status === 200,
    reachabilityShortTimeout: 5_000, // re-check quickly while unreachable
    reachabilityLongTimeout: 30_000,
    reachabilityRequestTimeout: 10_000,
    useNativeReachability: false,
  });
}

export const isOnlineState = (s: NetInfoState) => !!s.isConnected && s.isInternetReachable !== false;

export function watchNetwork(cb: (online: boolean) => void): () => void {
  return NetInfo.addEventListener(s => cb(isOnlineState(s)));
}

export function watchAppActive(cb: () => void): () => void {
  const sub = AppState.addEventListener('change', s => {
    if (s === 'active') cb();
  });
  return () => sub.remove();
}
