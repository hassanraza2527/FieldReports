import { v4 } from 'uuid';
/** Needs `import 'react-native-get-random-values'` at the top of index.js. */
export const newId = (): string => v4();
