import 'react-native-get-random-values'; // must be first: gives `uuid` a secure random source
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
