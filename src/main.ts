import { App } from './app/App';
import './ui/styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing.');
const app = new App(root);

if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
